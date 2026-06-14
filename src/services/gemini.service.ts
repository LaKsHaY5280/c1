import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

export const gemini = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});