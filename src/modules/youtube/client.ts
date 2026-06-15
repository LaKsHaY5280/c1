import { google, youtube_v3 } from "googleapis";
import { env } from "../../config/env";

/**
 * Creates an authenticated YouTube API client using stored OAuth credentials.
 * Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env.
 * Run src/modules/youtube/auth.ts once to generate the refresh token.
 */
export function createYouTubeClient(): youtube_v3.Youtube {
  if (!env.youtubeClientId || !env.youtubeClientSecret || !env.youtubeRefreshToken) {
    throw new Error(
      "YouTube credentials missing. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, " +
      "and YOUTUBE_REFRESH_TOKEN in .env. Run auth.ts to generate the refresh token.",
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    env.youtubeClientId,
    env.youtubeClientSecret,
    "http://localhost:3000/callback",
  );

  // Refresh token never expires — the client auto-renews access tokens as needed
  oauth2Client.setCredentials({
    refresh_token: env.youtubeRefreshToken,
  });

  return google.youtube({ version: "v3", auth: oauth2Client });
}
