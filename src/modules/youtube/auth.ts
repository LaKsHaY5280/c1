/**
 * One-time OAuth authentication script.
 *
 * Run this ONCE manually to generate your refresh token:
 *   npx tsx src/modules/youtube/auth.ts
 *
 * It will:
 *   1. Start a temporary local server on port 3000
 *   2. Open the Google authorization URL in your browser
 *   3. After you approve, Google redirects to localhost:3000
 *   4. The script catches the code automatically and exchanges it
 *   5. Prints your refresh token — copy it to .env
 *
 * IMPORTANT: In Google Cloud Console, your OAuth client must have this
 * redirect URI added under "Authorized redirect URIs":
 *   http://localhost:3000/callback
 *
 * Copy the refresh token into your .env:
 *   YOUTUBE_REFRESH_TOKEN=your_token_here
 */

import http from "http";
import { google } from "googleapis";
import { env } from "../../config/env";

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

async function main() {
  if (!env.youtubeClientId || !env.youtubeClientSecret) {
    console.error(
      "❌ YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env",
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    env.youtubeClientId,
    env.youtubeClientSecret,
    REDIRECT_URI,
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // always return a refresh token
  });

  // Start a temporary server to catch the OAuth callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authorization denied. You can close this tab.</h2>");
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h2>No code received. Try again.</h2>");
        server.close();
        reject(new Error("No authorization code received"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h2>✅ Authorization successful! You can close this tab and return to the terminal.</h2>",
      );
      server.close();
      resolve(code);
    });

    server.listen(PORT, () => {
      console.log("\n──────────────────────────────────────────────────");
      console.log("🔐 YouTube OAuth — One-Time Setup");
      console.log("──────────────────────────────────────────────────");
      console.log("\nOpening your browser for authorization...");
      console.log(`\nIf it doesn't open, go to:\n\n   ${authUrl}\n`);
      console.log("──────────────────────────────────────────────────\n");

      // Try to open the browser automatically
      import("child_process").then(({ exec }) => {
        exec(`start "" "${authUrl}"`);
      });
    });

    server.on("error", reject);
  });

  // Exchange the authorization code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\n❌ No refresh token returned. This usually means the app already has access.\n" +
      "   Go to https://myaccount.google.com/permissions, revoke access for your app, then run this script again.",
    );
    process.exit(1);
  }

  console.log("──────────────────────────────────────────────────");
  console.log("✅ Authentication successful!\n");
  console.log("Add this line to your .env file:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\n──────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Auth failed:", (err as Error).message ?? err);
  process.exit(1);
});
