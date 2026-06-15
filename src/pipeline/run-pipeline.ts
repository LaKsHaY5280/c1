import { STEP_ORDER } from "./pipeline-context";
import { STEP_REGISTRY, type PipelineContext } from "./step-registry";
import { runStep } from "./run-step";
import { runService } from "../services/run.service";
import { createLogger } from "../services/log.service";

/**
 * Runs the full 13-step pipeline from start to finish.
 * Creates a RunRecord, iterates STEP_ORDER, wraps each step with runStep(),
 * and persists status after every transition.
 */
export async function runPipeline(): Promise<void> {
  const run = await runService.create();
  const log = createLogger(run.id);

  log.info(`Pipeline started — run ${run.id}`);
  log.info(`Day: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}`);

  const ctx: PipelineContext = { log };

  try {
    for (const stepName of STEP_ORDER) {
      await runStep(stepName, run, log, () => STEP_REGISTRY[stepName](ctx));
    }

    await runService.markRunCompleted(run);
    log.info(`Pipeline completed — run ${run.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await runService.markRunFailed(run, message);
    log.error(`Pipeline failed — run ${run.id}: ${message}`);
    throw err;
  }
}
