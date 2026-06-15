import fs from "fs/promises";
import { appendFileSync } from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "data", "logs");

export type LogLevel = "info" | "warn" | "error";

export interface LogEvent {
  runId: string;
  step?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

// Write one NDJSON line to the run's log file (append-only, sync)
// Sync appendFile keeps the call simple and avoids async race conditions
// when multiple steps log in quick succession.
function append(event: LogEvent): void {
  const dir = path.join(LOGS_DIR, "..");
  // ensure directory exists (best-effort sync check)
  try {
    const filePath = path.join(LOGS_DIR, `${event.runId}.log.ndjson`);
    appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // If the log dir doesn't exist yet, mkdir is async — fall through silently.
    // The terminal output is always available regardless.
  }
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

// Read all log events for a run from the NDJSON file
async function read(runId: string): Promise<LogEvent[]> {
  await ensureDir();
  const filePath = path.join(LOGS_DIR, `${runId}.log.ndjson`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEvent);
  } catch {
    return [];
  }
}

// Logger factory — creates a logger bound to a run (and optionally a step)
export function createLogger(runId: string, step?: string) {
  // Ensure the log directory exists before the first write
  ensureDir().catch(() => {});

  function log(level: LogLevel, message: string): void {
    const event: LogEvent = {
      runId,
      step,
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    // Always print to terminal — same developer experience as before
    const prefix = step ? `[${step}]` : "";
    const icon = level === "error" ? "❌" : level === "warn" ? "⚠️ " : "  ";
    console.log(`${icon} ${prefix} ${message}`);

    // Persist to NDJSON log file
    append(event);
  }

  return {
    info:  (msg: string) => log("info", msg),
    warn:  (msg: string) => log("warn", msg),
    error: (msg: string) => log("error", msg),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const logService = { read, ensureDir };
