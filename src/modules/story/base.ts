import { gemini } from "../../services/gemini.service";

const MODEL = "gemini-3.1-flash-lite";

// Retry config for transient Gemini errors (503, 429, 500)
const RETRYABLE_CODES = new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/**
 * Shared Gemini JSON call used by every story generator.
 * Sends a prompt, expects JSON back, parses and returns it.
 * Retries on transient errors (503, 429, 500) with exponential backoff.
 * Strips markdown code fences in case the model wraps its response.
 */
export async function generateJson<T>(prompt: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.log(`  ⟳ Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const response = await gemini.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const raw = response.text ?? "";

      // Strip markdown code fences: ```json ... ``` or ``` ... ```
      const text = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      return JSON.parse(text) as T;
    } catch (err: unknown) {
      lastError = err;

      // Only retry on known transient status codes
      const status = (err as { status?: number })?.status;
      if (!status || !RETRYABLE_CODES.has(status)) throw err;

      if (attempt === MAX_RETRIES) break;
    }
  }

  throw lastError;
}

/**
 * Common envelope fields present on every stored file.
 */
export interface BaseFile {
  id: string;
  scriptId: string;
  title: string;
  createdAt: string;
}

/**
 * Returns the current UTC timestamp string.
 * Centralised so every file uses the same format.
 */
export function now(): string {
  return new Date().toISOString();
}
