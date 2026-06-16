/**
 * Cancellation token — shared between the pipeline runner and the cancel endpoint.
 *
 * Design:
 *  - runPipeline() creates a token, registers it, and checks it between steps.
 *  - run-step checks it before invoking the step function.
 *  - POST /pipeline/cancel/:runId calls registry.cancel(runId), which:
 *      1. Aborts the token's AbortController — any in-flight fetch() that
 *         received the signal will throw AbortError immediately.
 *      2. Kills any registered ffmpeg child process.
 *      3. Flips the cancelled flag so the next inter-step check throws CancelledError.
 *
 * Gemini API calls accept an AbortSignal via httpOptions. Pass token.signal
 * to the Gemini client constructor or generateContent call to get true mid-call
 * cancellation rather than just between-step cancellation.
 *
 * ffmpeg processes are registered via token.setFfmpegProcess(). The renderer
 * calls this before each ffmpeg operation and clears it after.
 */

import type { FfmpegCommand } from "fluent-ffmpeg";

export class CancelledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was cancelled`);
    this.name = "CancelledError";
  }
}

export interface CancellationToken {
  readonly runId: string;
  readonly cancelled: boolean;
  /** AbortSignal to pass to fetch / Gemini API calls for mid-request cancellation. */
  readonly signal: AbortSignal;
  /** Flip the flag, abort the signal, and kill any registered ffmpeg process. */
  cancel(): void;
  /** Throw CancelledError if cancel() has been called. */
  throwIfCancelled(): void;
  /** Register the current ffmpeg command so it can be killed on cancel. */
  setFfmpegProcess(cmd: FfmpegCommand | null): void;
}

function createToken(runId: string): CancellationToken {
  let cancelled = false;
  let ffmpegCmd: FfmpegCommand | null = null;
  const controller = new AbortController();

  return {
    get runId()    { return runId; },
    get cancelled() { return cancelled; },
    get signal()   { return controller.signal; },

    cancel() {
      if (cancelled) return; // idempotent
      cancelled = true;
      controller.abort();
      if (ffmpegCmd) {
        try { ffmpegCmd.kill("SIGKILL"); } catch { /* ignore */ }
        ffmpegCmd = null;
      }
    },

    throwIfCancelled() {
      if (cancelled) throw new CancelledError(runId);
    },

    setFfmpegProcess(cmd: FfmpegCommand | null) {
      ffmpegCmd = cmd;
    },
  };
}

// ─── In-memory registry ────────────────────────────────────────────────────────

const tokens = new Map<string, CancellationToken>();

export const cancellationRegistry = {
  register(runId: string): CancellationToken {
    const token = createToken(runId);
    tokens.set(runId, token);
    return token;
  },

  cancel(runId: string): boolean {
    const token = tokens.get(runId);
    if (!token) return false;
    token.cancel();
    return true;
  },

  unregister(runId: string): void {
    tokens.delete(runId);
  },

  isCancelled(runId: string): boolean {
    return tokens.get(runId)?.cancelled ?? false;
  },

  getToken(runId: string): CancellationToken | undefined {
    return tokens.get(runId);
  },
};
