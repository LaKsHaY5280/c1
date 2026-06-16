import { STEP_ORDER, type RunRecord } from "./pipeline-context";
import { STEP_REGISTRY, type PipelineContext } from "./step-registry";
import { runStep } from "./run-step";
import { runService } from "../services/run.service";
import { createLogger } from "../services/log.service";
import { cancellationRegistry, CancelledError } from "./cancellation";

/**
 * Runs the full 12-step pipeline from start to finish.
 * If an existing RunRecord is passed (from the API), it is reused.
 * Otherwise a new one is created (CLI path).
 *
 * A CancellationToken is registered for the run's lifetime.
 * POST /pipeline/cancel/:runId calls cancellationRegistry.cancel(runId),
 * which causes the next inter-step check in runStep() to throw CancelledError,
 * stopping the pipeline without starting any further steps.
 */
export async function runPipeline(existingRun?: RunRecord): Promise<void> {
  const run = existingRun ?? await runService.create();
  const log = createLogger(run.id);
  const token = cancellationRegistry.register(run.id);

  log.info(`Pipeline started — run ${run.id}`);
  log.info(`Day: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}`);

  const ctx: PipelineContext = { log };

  try {
    for (const stepName of STEP_ORDER) {
      await runStep(stepName, run, log, () => STEP_REGISTRY[stepName](ctx), token);
    }

    await runService.markRunCompleted(run);
    log.info(`Pipeline completed — run ${run.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof CancelledError) {
      // Run record was already marked failed by the cancel endpoint.
      // Re-read it from disk to get the latest state before logging.
      log.warn(`Pipeline cancelled — run ${run.id}`);
    } else {
      await runService.markRunFailed(run, message);
      log.error(`Pipeline failed — run ${run.id}: ${message}`);
    }

    throw err;
  } finally {
    // Always clean up the token regardless of outcome
    cancellationRegistry.unregister(run.id);
  }
}
