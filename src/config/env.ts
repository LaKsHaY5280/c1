import dotenv from "dotenv";

dotenv.config();

export const env = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  pexelsApiKey: process.env.PEXELS_API_KEY,
};
