import { gemini } from "../../services/gemini.service";

const MODEL = "gemini-3.1-flash-lite";

/**
 * Shared Gemini JSON call used by every story generator.
 * Sends a prompt, expects JSON back, parses and returns it.
 */
export async function generateJson<T>(prompt: string): Promise<T> {
  const response = await gemini.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  return JSON.parse(text) as T;
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
