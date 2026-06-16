import { Router, type Request, type Response } from "express";
import { queueService } from "../services/queue.service";
import { runPipeline } from "../pipeline/run-pipeline";
import { runService } from "../services/run.service";

const router = Router();

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

// ─── GET /queue ───────────────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  res.json(await queueService.list());
});

// ─── GET /queue/:id ───────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const item = await queueService.load(String(req.params.id));
  if (!item) {
    res.status(404).json({ error: `Queue item not found: ${req.params.id}` });
    return;
  }
  res.json(item);
});

// ─── POST /queue ──────────────────────────────────────────────────────────────
// Body: { genre: string, scheduledFor: string (ISO), notes?: string }
router.post("/", async (req: Request, res: Response) => {
  const { genre, scheduledFor, notes } = req.body as {
    genre?: string;
    scheduledFor?: string;
    notes?: string;
  };

  if (!genre) {
    res.status(400).json({ error: "genre is required" });
    return;
  }
  if (!scheduledFor) {
    res.status(400).json({ error: "scheduledFor (ISO datetime) is required" });
    return;
  }

  const item = await queueService.create(genre, scheduledFor, notes);
  res.status(201).json(item);
});

// ─── PUT /queue/:id ───────────────────────────────────────────────────────────
// Partial update — genre, scheduledFor, status, notes
router.put("/:id", async (req: Request, res: Response) => {
  const updated = await queueService.update(String(req.params.id), req.body);
  if (!updated) {
    res.status(404).json({ error: `Queue item not found: ${req.params.id}` });
    return;
  }
  res.json(updated);
});

// ─── DELETE /queue/:id ────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const removed = await queueService.remove(String(req.params.id));
  if (!removed) {
    res.status(404).json({ error: `Queue item not found: ${req.params.id}` });
    return;
  }
  res.json({ message: "Queue item deleted" });
});

// ─── POST /queue/:id/trigger ──────────────────────────────────────────────────
// Manually trigger generation for a specific queue item regardless of schedule.
router.post("/:id/trigger", async (req: Request, res: Response) => {
  const item = await queueService.load(String(req.params.id));
  if (!item) {
    res.status(404).json({ error: `Queue item not found: ${req.params.id}` });
    return;
  }

  if (item.status === "generating" || item.status === "uploaded") {
    res.status(409).json({ error: `Item is already ${item.status}` });
    return;
  }

  let createdRun: import("../pipeline/pipeline-context").RunRecord | null = null;

  const lockResult = await runService.withLock(async () => {
    const active = await runService.getActiveRun();
    if (active) return active.id; // conflict signal
    createdRun = await runService.create();
    await queueService.update(item.id, { status: "generating", runId: createdRun.id });
    return null;
  });

  if (lockResult === null && createdRun === null) {
    res.status(409).json({ error: "Another start is already in progress — try again in a moment" });
    return;
  }
  if (typeof lockResult === "string") {
    res.status(409).json({ error: "Pipeline already running", runId: lockResult });
    return;
  }

  const run = createdRun!;
  res.status(202).json({ runId: run.id, queueItemId: item.id, message: "Generation started" });

  runPipeline(run)
    .then(async () => {
      await syncOutputIds(item.id, run.id);
      await queueService.update(item.id, { status: "generated" });
    })
    .catch(async (err) => {
      await queueService.update(item.id, { status: "failed", notes: (err as Error).message });
    });
});

export default router;
