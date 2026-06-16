import { type RunRecord, type StepName } from "./pipeline-context";
import { runService } from "../services/run.service";
import { type Logger } from "../services/log.service";
import { type CancellationToken, CancelledError } from "./cancellation";

/**
 * Wraps a single pipeline step.
 * - Checks the cancellation token BEFORE starting — if cancelled, marks the
 *   step failed and re-throws so the pipeline runner stops cleanly.
 * - Marks the step running before calling fn()
 * - Marks it completed (with outputId) or failed (with error message) after
 * - Writes the RunRecord to disk after every state change
 * - Returns the outputId if the step produced one
 */
export async function runStep(
  stepName: StepName,
  run: RunRecord,
  log: Logger,
  fn: () => Promise<string | undefined>,
  token?: CancellationToken,
): Promise<string | undefined> {
  // Hard stop: refuse to start if cancel was requested between steps
  if (token?.cancelled) {
    const err = new CancelledError(run.id);
    await runService.markStepFailed(run, stepName, err.message);
    log.warn(`Step ${stepName} skipped — run was cancelled`);
    throw err;
  }

  await runService.markStepStarted(run, stepName);
  log.info(`Starting step: ${stepName}`);

  try {
    const outputId = await fn();
    await runService.markStepCompleted(run, stepName, outputId);
    log.info(`Completed step: ${stepName}${outputId ? ` → ${outputId}` : ""}`);
    return outputId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await runService.markStepFailed(run, stepName, message);

    if (err instanceof CancelledError) {
      log.warn(`Step ${stepName} cancelled`);
    } else {
      log.error(`Failed step: ${stepName} — ${message}`);
    }

    throw err; // re-throw so run-pipeline can catch and mark the run failed
  }
}
