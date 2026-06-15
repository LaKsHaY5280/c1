import { type RunRecord, type StepName } from "./pipeline-context";
import { runService } from "../services/run.service";
import { type Logger } from "../services/log.service";

/**
 * Wraps a single pipeline step.
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
): Promise<string | undefined> {
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
    log.error(`Failed step: ${stepName} — ${message}`);
    throw err; // re-throw so run-pipeline can catch and mark the run failed
  }
}
