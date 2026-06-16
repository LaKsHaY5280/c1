import { Router, type Request, type Response } from "express";
import { runPipeline } from "../pipeline/run-pipeline";
import { runStep } from "../pipeline/run-step";
import { STEP_REGISTRY } from "../pipeline/step-registry";
import { type StepName, STEP_ORDER } from "../pipeline/pipeline-context";
import { runService } from "../services/run.service";
import { createLogger } from "../services/log.service";
import { hydrateContext } from "../pipeline/hydrate-context";

const router = Router();

// ─── POST /pipeline/start ─────────────────────────────────────────────────────
// Kick off a full pipeline run in the background.
// Rejects with 409 if a run is already in-progress.
router.post("/start", async (_req: Request, res: Response) => {
  // Concurrent run protection
  const active = await runService.getActiveRun();
  if (active) {
    res.status(409).json({
      error: "Pipeline already running",
      runId: active.id,
      message: `Run ${active.id} is currently ${active.status}. Wait for it to finish before starting a new one.`,
    });
    return;
  }

  const run = await runService.create();
  res.status(202).json({ runId: run.id, message: "Pipeline started" });

  // Pass the pre-created run so runPipeline() does not create a second one
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
// Marks a running run as failed/cancelled.
// Note: this does not interrupt in-flight ffmpeg/Gemini calls — those will
// continue until they finish or time out.  The run record is immediately
// marked failed so the dashboard reflects the intent.
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

  await runService.markRunFailed(run, "Cancelled by user");
  res.json({ runId: runIdStr, message: "Run marked as cancelled" });
});

export default router;
