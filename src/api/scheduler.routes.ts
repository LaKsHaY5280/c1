/**
 * Scheduler API
 *
 * POST /scheduler/tick   — check for due items and trigger the next one
 * POST /scheduler/next   — trigger the next pending item (ignores schedule)
 * GET  /scheduler/status — return scheduler state and what's due
 */

import { Router, type Request, type Response } from "express";
import { queueService } from "../services/queue.service";
import { runService } from "../services/run.service";
import { runPipeline } from "../pipeline/run-pipeline";
import { schedulerService } from "../services/scheduler.service";

const router = Router();

// ─── GET /scheduler/status ────────────────────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  const due = await queueService.getDueItems();
  const active = await runService.getActiveRun();
  const isRunning = schedulerService.isRunning();

  res.json({
    schedulerRunning: isRunning,
    activeRun: active ? { id: active.id, status: active.status } : null,
    dueItems: due.length,
    dueItemIds: due.map((d) => d.id),
  });
});

// ─── POST /scheduler/tick ─────────────────────────────────────────────────────
// Check for due queue items and start the next one if the pipeline is free.
// This is also called automatically by the scheduler loop.
router.post("/tick", async (_req: Request, res: Response) => {
  const result = await schedulerService.tick();
  res.json(result);
});

// ─── POST /scheduler/next ─────────────────────────────────────────────────────
// Force-trigger the next pending item regardless of scheduledFor time.
router.post("/next", async (_req: Request, res: Response) => {
  const active = await runService.getActiveRun();
  if (active) {
    res.status(409).json({ error: "Pipeline already running", runId: active.id });
    return;
  }

  const next = await queueService.getNextPending();
  if (!next) {
    res.status(404).json({ error: "No pending items in queue" });
    return;
  }

  const run = await runService.create();
  await queueService.update(next.id, { status: "generating", runId: run.id });

  res.status(202).json({
    runId: run.id,
    queueItemId: next.id,
    genre: next.genre,
    message: "Triggered next pending item",
  });

  runPipeline(run)
    .then(async () => { await queueService.update(next.id, { status: "generated" }); })
    .catch(async (err) => { await queueService.update(next.id, { status: "failed", notes: (err as Error).message }); });
});

export default router;
