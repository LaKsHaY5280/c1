import { Router, type Request, type Response } from "express";
import { runPipeline } from "../pipeline/run-pipeline";
import { runStep } from "../pipeline/run-step";
import { STEP_REGISTRY } from "../pipeline/step-registry";
import { type StepName, STEP_ORDER } from "../pipeline/pipeline-context";
import { runService } from "../services/run.service";
import { createLogger } from "../services/log.service";
import { hydrateContext } from "../pipeline/hydrate-context";
import { cancellationRegistry } from "../pipeline/cancellation";

const router = Router();

// ─── POST /pipeline/start ─────────────────────────────────────────────────────
// Kick off a full pipeline run in the background.
// Rejects with 409 if a run is already in-progress.
router.post("/start", async (_req: Request, res: Response) => {
  let createdRun: import("../pipeline/pipeline-context").RunRecord | null = null;

  const lockResult = await runService.withLock(async () => {
    const active = await runService.getActiveRun();
    if (active) return active.id; // return existing runId as string = conflict signal
    createdRun = await runService.create();
    return null;                  // null = success
  });

  if (lockResult === null && createdRun === null) {
    // Lock not acquired
    res.status(409).json({ error: "Another start is already in progress — try again in a moment" });
    return;
  }
  if (typeof lockResult === "string") {
    // Lock acquired but active run found
    res.status(409).json({
      error: "Pipeline already running",
      runId: lockResult,
      message: `Run ${lockResult} is currently active.`,
    });
    return;
  }

  // createdRun is guaranteed non-null here
  const run = createdRun!;
  res.status(202).json({ runId: run.id, message: "Pipeline started" });
  runPipeline(run).catch((err) => {
    console.error(`Background pipeline failed: ${(err as Error).message}`);
  });
});

// ─── POST /pipeline/step/:step ────────────────────────────────────────────────
// Run a single step against an existing run, with context fully restored from disk.
// Body: { runId: string }
router.post("/step/:step", async (req: Request, res: Response) => {
  const stepName = req.params.step as StepName;
  const { runId } = req.body as { runId?: string };

  if (!STEP_ORDER.includes(stepName)) {
    res.status(400).json({ error: `Unknown step: ${stepName}` });
    return;
  }

  if (!runId) {
    res.status(400).json({ error: "runId is required in the request body" });
    return;
  }

  const run = await runService.load(runId);
  if (!run) {
    res.status(404).json({ error: `Run not found: ${runId}` });
    return;
  }

  const log = createLogger(run.id, stepName);

  res.status(202).json({ runId, step: stepName, message: "Step started" });

  // Hydrate context from disk so the step has access to all prior outputs
  hydrateContext(run)
    .then((ctx) =>
      runStep(stepName, run, log, () => STEP_REGISTRY[stepName](ctx)),
    )
    .catch((err) => {
      console.error(`Step ${stepName} failed: ${(err as Error).message}`);
    });
});

// ─── POST /pipeline/cancel/:runId ────────────────────────────────────────────
// Cancels an active run.
//
// Two-layer stop:
//  1. In-memory: calls cancellationRegistry.cancel(runId) so the pipeline loop
//     stops at the next inter-step boundary (current step still finishes).
//  2. Disk: marks the RunRecord as failed so the dashboard reflects the intent
//     immediately, even before the current step completes.
//
// If the run is not in this process's registry (e.g. server restarted), only
// the disk update happens — same behaviour as before.
router.post("/cancel/:runId", async (req: Request, res: Response) => {
  const { runId } = req.params;
  const runIdStr = String(runId);

  const run = await runService.load(runIdStr);
  if (!run) {
    res.status(404).json({ error: `Run not found: ${runId}` });
    return;
  }

  if (run.status !== "running" && run.status !== "pending") {
    res.status(409).json({
      error: `Run ${runIdStr} is not active (status: ${run.status})`,
    });
    return;
  }

  // Signal the pipeline loop to stop between steps
  const wasInMemory = cancellationRegistry.cancel(runIdStr);

  // Always update the run record on disk so the dashboard sees it immediately
  await runService.markRunFailed(run, "Cancelled by user");

  res.json({
    runId: runIdStr,
    message: wasInMemory
      ? "Run cancelled — current step will finish, no further steps will start"
      : "Run marked as cancelled (pipeline not active in this process)",
  });
});

export default router;
