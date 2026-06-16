/**
 * Scheduler service — periodic tick that checks the queue and fires
 * generation for any due items when the pipeline is free.
 *
 * Usage:
 *   schedulerService.start()   — begin automatic ticking (every 60s)
 *   schedulerService.stop()    — stop ticking
 *   schedulerService.tick()    — run one check immediately (also called by API)
 *
 * Failure behaviour:
 *   - If a run fails, the queue item is reset to "pending" with a cooldown
 *     (scheduledFor moved forward by RETRY_DELAY_MS) so it is not immediately
 *     re-triggered on the next tick.
 *   - After MAX_CONSECUTIVE_FAILURES back-to-back failures the scheduler
 *     pauses itself to avoid burning through all queue items during an outage
 *     (e.g. Gemini TTS being unavailable). It logs a warning and must be
 *     restarted manually via POST /scheduler/tick or by restarting the server.
 */

import { queueService } from "./queue.service";
import { runService } from "./run.service";
import { runPipeline } from "../pipeline/run-pipeline";

const TICK_INTERVAL_MS         = 60_000;   // 1 minute between ticks
const RETRY_DELAY_MS           = 10 * 60_000; // reschedule failed items 10 min out
const MAX_CONSECUTIVE_FAILURES = 3;           // pause scheduler after this many in a row

let tickTimer:            ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

export interface TickResult {
  triggered:    boolean;
  queueItemId?: string;
  runId?:       string;
  reason?:      string;
}

/**
 * After a pipeline run completes, pull the output IDs from the run record
 * and write them back to the linked queue item.
 */
async function syncOutputIds(queueItemId: string, runId: string): Promise<void> {
  const run = await runService.load(runId);
  if (!run) return;
  await queueService.update(queueItemId, {
    videoId:     run.steps["render"]?.outputId,
    metadataId:  run.steps["metadata"]?.outputId,
    thumbnailId: run.steps["thumbnail"]?.outputId,
  });
}

async function tick(): Promise<TickResult> {
  const result = await runService.withLock(async () => {
    const active = await runService.getActiveRun();
    if (active) return { busy: active.id };

    const due = await queueService.getDueItems();
    if (due.length === 0) return { noDue: true };

    const item = due[0]!;
    const run = await runService.create();
    await queueService.update(item.id, { status: "generating", runId: run.id });
    return { item, run };
  });

  if (result === null) return { triggered: false, reason: "lock contention — retry next tick" };
  if ("busy"  in result) return { triggered: false, reason: `pipeline busy (run ${result.busy})` };
  if ("noDue" in result) return { triggered: false, reason: "no due items" };

  const { item, run } = result;
  console.log(`⏰ Scheduler triggered queue item ${item.id} (genre: ${item.genre}) → run ${run.id}`);

  runPipeline(run)
    .then(async () => {
      consecutiveFailures = 0;
      await syncOutputIds(item.id, run.id);
      await queueService.update(item.id, { status: "generated" });
    })
    .catch(async (err) => {
      consecutiveFailures++;
      const message = (err as Error).message;
      const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
      await queueService.update(item.id, {
        status: "pending", scheduledFor: retryAt,
        notes: `Auto-retry after failure: ${message}`,
      });
      console.error(
        `⏰ Scheduler: run ${run.id} failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}). ` +
        `Queue item ${item.id} rescheduled to ${retryAt}.`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `⏰ Scheduler pausing after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. ` +
          `Restart via POST /scheduler/tick or server restart.`,
        );
        stop();
      }
    });

  return { triggered: true, queueItemId: item.id, runId: run.id };
}

function start(): void {
  if (tickTimer) return; // already running
  consecutiveFailures = 0;
  tickTimer = setInterval(() => {
    tick().catch((err) => console.error("Scheduler tick error:", err));
  }, TICK_INTERVAL_MS);
  console.log(`⏰ Scheduler started (interval: ${TICK_INTERVAL_MS / 1000}s)`);
}

function stop(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log("⏰ Scheduler stopped");
  }
}

function isRunning(): boolean {
  return tickTimer !== null;
}

export const schedulerService = { start, stop, tick, isRunning };
