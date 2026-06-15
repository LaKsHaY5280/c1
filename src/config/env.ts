import dotenv from "dotenv";

dotenv.config();

export const env = {
  geminiApiKey:          process.env.GEMINI_API_KEY,
  pexelsApiKey:          process.env.PEXELS_API_KEY,
  youtubeClientId:       process.env.YOUTUBE_CLIENT_ID,
  youtubeClientSecret:   process.env.YOUTUBE_CLIENT_SECRET,
  youtubeRefreshToken:   process.env.YOUTUBE_REFRESH_TOKEN,
};
