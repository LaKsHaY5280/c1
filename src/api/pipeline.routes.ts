import { Router, type Request, type Response } from "express";
import { runPipeline } from "../pipeline/run-pipeline";
import { runStep } from "../pipeline/run-step";
import { STEP_REGISTRY, type PipelineContext } from "../pipeline/step-registry";
import { type StepName, STEP_ORDER } from "../pipeline/pipeline-context";
import { runService } from "../services/run.service";
import { createLogger } from "../services/log.service";

const router = Router();

// POST /pipeline/start — kick off a full pipeline run in the background
router.post("/start", async (_req: Request, res: Response) => {
  const run = await runService.create();
  res.status(202).json({ runId: run.id, message: "Pipeline started" });

  // Run in background — do not await so the response returns immediately
  runPipeline().catch((err) => {
    console.error(`Background pipeline failed: ${(err as Error).message}`);
  });
});

// POST /pipeline/step/:step — run a single step against a specific run
// Body: { runId: string }
// Used for: retry a failed step, manual single-step trigger
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
  const ctx: PipelineContext = { log };

  res.status(202).json({ runId, step: stepName, message: "Step started" });

  // Run step in background
  runStep(stepName, run, log, () => STEP_REGISTRY[stepName](ctx)).catch((err) => {
    console.error(`Step ${stepName} failed: ${(err as Error).message}`);
  });
});

export default router;
