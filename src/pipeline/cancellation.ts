/**
 * Cancellation token — shared between the pipeline runner and the cancel endpoint.
 *
 * Design:
 *  - runPipeline() creates a token, registers it, and checks it between steps.
 *  - run-step checks it before invoking the step function.
 *  - POST /pipeline/cancel/:runId calls registry.cancel(runId), which flips the
 *    token flag. The next inter-step check throws CancelledError, unwinding the
 *    pipeline loop cleanly without leaving any step in "running" state.
 *  - In-flight Gemini/ffmpeg work for the CURRENT step will still run to
 *    completion (Node.js has no preemptive kill), but no subsequent step starts.
 */

export class CancelledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was cancelled`);
    this.name = "CancelledError";
  }
}

export interface CancellationToken {
  readonly runId: string;
  readonly cancelled: boolean;
  /** Flip the flag. Idempotent. */
  cancel(): void;
  /** Throw CancelledError if cancel() has been called. */
  throwIfCancelled(): void;
}

function createToken(runId: string): CancellationToken {
  let cancelled = false;
  return {
    get runId() { return runId; },
    get cancelled() { return cancelled; },
    cancel() { cancelled = true; },
    throwIfCancelled() {
      if (cancelled) throw new CancelledError(runId);
    },
  };
}

// ─── In-memory registry ───────────────────────────────────────────────────────
// One token per active run. Cleared when the run finishes (success, fail, cancel).
// A Map is safe for single-process use; replace with Redis if you ever run multiple
// server instances.

const tokens = new Map<string, CancellationToken>();

export const cancellationRegistry = {
  /** Create and register a token for a new run. */
  register(runId: string): CancellationToken {
    const token = createToken(runId);
    tokens.set(runId, token);
    return token;
  },

  /** Cancel a run by ID. Returns true if a token was found and cancelled. */
  cancel(runId: string): boolean {
    const token = tokens.get(runId);
    if (!token) return false;
    token.cancel();
    return true;
  },

  /** Remove the token when a run finishes (success, fail, or cancel). */
  unregister(runId: string): void {
    tokens.delete(runId);
  },

  /** Check whether a run has been cancelled (used in tests / manual checks). */
  isCancelled(runId: string): boolean {
    return tokens.get(runId)?.cancelled ?? false;
  },
};
