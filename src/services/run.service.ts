import fs from "fs/promises";
import path from "path";
import {
  type RunRecord,
  type StepName,
  type RunStatus,
  type StepEvent,
  createInitialSteps,
  STEP_ORDER,
} from "../pipeline/pipeline-context";

const RUNS_DIR  = path.join(process.cwd(), "data", "runs");
const LOCK_FILE = path.join(process.cwd(), "data", "runs", ".pipeline.lock");

// ─── Atomic start lock ────────────────────────────────────────────────────────
// Prevents /pipeline/start, /queue/:id/trigger, and the scheduler from racing
// each other and creating duplicate runs. Uses an exclusive file creation as
// the locking primitive — works reliably in a single-process Node.js server.

async function acquireLock(): Promise<boolean> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  try {
    // "wx" = fail if file exists — atomic on all major filesystems
    await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: "wx" });
    return true;
  } catch {
    return false; // lock held by another concurrent caller
  }
}

async function releaseLock(): Promise<void> {
  try { await fs.unlink(LOCK_FILE); } catch { /* already gone */ }
}

/**
 * Acquire the lock, run fn(), then always release.
 * Returns null if the lock could not be acquired (another start is in progress).
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const acquired = await acquireLock();
  if (!acquired) return null;
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}

// RUN-20260615-001
function buildRunId(sequence: number): string {
  const now = new Date();
  const date =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  return `RUN-${date}-${String(sequence).padStart(3, "0")}`;
}

async function getNextSequence(): Promise<number> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files = await fs.readdir(RUNS_DIR);
  return files.length + 1;
}

async function save(run: RunRecord): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const filePath = path.join(RUNS_DIR, `${run.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
}

async function load(runId: string): Promise<RunRecord | null> {
  try {
    const filePath = path.join(RUNS_DIR, `${runId}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as RunRecord;
  } catch {
    return null;
  }
}

async function list(): Promise<RunRecord[]> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files = await fs.readdir(RUNS_DIR);
  const records: RunRecord[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      const content = await fs.readFile(path.join(RUNS_DIR, file), "utf-8");
      if (!content.trim()) continue; // skip empty files
      records.push(JSON.parse(content) as RunRecord);
    } catch {
      // Skip corrupt or partially-written files — log for visibility
      console.warn(`[run.service] Skipping unreadable run file: ${file}`);
    }
  }
  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function create(): Promise<RunRecord> {
  const seq = await getNextSequence();
  const id = buildRunId(seq);
  const now = new Date().toISOString();

  const run: RunRecord = {
    id,
    status: "running",
    startedAt: now,
    steps: createInitialSteps(),
    history: [],
  };

  await save(run);
  return run;
}

async function markStepStarted(
  run: RunRecord,
  step: StepName,
): Promise<RunRecord> {
  const ts = new Date().toISOString();

  run.currentStep = step;
  run.steps[step] = { step, status: "running", startedAt: ts };

  const event: StepEvent = { step, event: "started", timestamp: ts };
  run.history.push(event);

  await save(run);
  return run;
}

async function markStepCompleted(
  run: RunRecord,
  step: StepName,
  outputId?: string,
): Promise<RunRecord> {
  const ts = new Date().toISOString();

  run.steps[step] = {
    step,
    status: "completed",
    startedAt: run.steps[step].startedAt,
    finishedAt: ts,
    outputId,
  };

  const event: StepEvent = { step, event: "completed", timestamp: ts, outputId };
  run.history.push(event);

  await save(run);
  return run;
}

async function markStepFailed(
  run: RunRecord,
  step: StepName,
  error: string,
): Promise<RunRecord> {
  const ts = new Date().toISOString();

  run.steps[step] = {
    step,
    status: "failed",
    startedAt: run.steps[step].startedAt,
    finishedAt: ts,
    error,
  };

  const event: StepEvent = { step, event: "failed", timestamp: ts, error };
  run.history.push(event);

  await save(run);
  return run;
}

async function markRunCompleted(run: RunRecord): Promise<RunRecord> {
  run.status = "completed";
  run.finishedAt = new Date().toISOString();
  run.currentStep = undefined;
  await save(run);
  return run;
}

async function markRunFailed(run: RunRecord, error: string): Promise<RunRecord> {
  run.status = "failed";
  run.finishedAt = new Date().toISOString();
  run.error = error;
  await save(run);
  return run;
}

/**
 * Returns the first run with status "running" or "pending", or null if none.
 * Used by the /pipeline/start endpoint to enforce single-run concurrency.
 */
async function getActiveRun(): Promise<RunRecord | null> {
  const runs = await list();
  return runs.find((r) => r.status === "running" || r.status === "pending") ?? null;
}

export const runService = {
  create,
  load,
  list,
  save,
  withLock,
  getActiveRun,
  markStepStarted,
  markStepCompleted,
  markStepFailed,
  markRunCompleted,
  markRunFailed,
};
