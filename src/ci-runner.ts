/**
 * CI entrypoint — used by GitHub Actions instead of index.ts.
 *
 * Differences from the normal server path:
 *  - No queue, no scheduler — runs the pipeline once and exits.
 *  - Respects the GENRE_OVERRIDE env var so the workflow_dispatch input
 *    can target a specific genre without touching today's schedule.
 *  - Exits with code 1 on failure so GitHub Actions marks the job as failed.
 */

import { runPipeline } from "./pipeline/run-pipeline";
import { getTodaysGenre } from "./modules/story/idea";

async function main() {
  const genreOverride = process.env.GENRE_OVERRIDE?.trim() || undefined;

  if (genreOverride) {
    console.log(`🎬 Genre override: ${genreOverride.toUpperCase()}`);
    process.env.GENRE_OVERRIDE = genreOverride; // already set, but make it explicit
  } else {
    console.log(`🎬 Today's genre: ${getTodaysGenre().toUpperCase()}`);
  }

  await runPipeline();
}

main().catch((err) => {
  console.error("❌ Pipeline failed:", (err as Error).message ?? err);
  process.exit(1);
});
