/**
 * Thumbnail generator — v2.0
 *
 * Extracts a frame from the rendered MP4 at the strongest visual moment
 * (10% into the video by default — avoids black frames at the start),
 * then burns the video title as text overlay.
 *
 * Uses the same bundled ffmpeg binary as the rest of the pipeline,
 * so no extra dependencies are needed.
 *
 * Output: output/thumbnails/THM-*.jpg  (9:16 vertical, 1080×1920)
 * Metadata: data/media/thumbnails/THM-*.json
 */

import path from "path";
import { mkdir } from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { storage } from "../storage";
import { deriveThumbnailId } from "../id-generator";
import { now } from "../story/base";
import { type VideoFile } from "./renderer";
import { type MetadataFile } from "./metadata";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const THUMBNAIL_DIR = path.join(process.cwd(), "output", "thumbnails");
const THUMBNAIL_WIDTH  = 1080;
const THUMBNAIL_HEIGHT = 1920;

export interface ThumbnailFile {
  id: string;
  scriptId: string;
  videoId: string;
  title: string;
  thumbnailPath: string;   // absolute path to output/thumbnails/THM-*.jpg
  sourceAssetPath: string; // the video it was extracted from
  frameTimeSeconds: number;
  createdAt: string;
}

/**
 * Truncates the title to fit on a mobile screen.
 * Keeps the most impactful words. Max ~40 chars displayed.
 */
function truncateTitle(title: string, maxLen = 40): string {
  if (title.length <= maxLen) return title;
  // Cut at last word boundary before maxLen
  const cut = title.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Escapes special characters that ffmpeg's drawtext filter interprets.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Extract a single frame from the video at `frameTime` seconds and
 * overlay the title text at the bottom of the frame.
 */
function extractFrameWithTitle(
  videoPath: string,
  outputPath: string,
  frameTime: number,
  title: string,
): Promise<void> {
  const safeTitle = escapeDrawtext(truncateTitle(title));

  // drawtext filter: large bold white text, black outline, bottom-center
  const drawtextFilter =
    `drawtext=fontfile=/Windows/Fonts/arialbd.ttf:` +
    `text='${safeTitle}':` +
    `fontsize=72:` +
    `fontcolor=white:` +
    `bordercolor=black:borderw=4:` +
    `shadowcolor=black@0.6:shadowx=3:shadowy=3:` +
    `x=(w-text_w)/2:` +
    `y=h-text_h-120`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions([`-ss ${frameTime}`])
      .frames(1)
      .videoFilter([
        // Ensure correct dimensions first
        `scale=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT}`,
        drawtextFilter,
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`thumbnail extraction failed: ${err.message}`)))
      .run();
  });
}

export class ThumbnailGenerator {
  async generate(
    videoFile: VideoFile,
    metadataFile: MetadataFile,
  ): Promise<ThumbnailFile> {
    console.log(`🖼  Generating thumbnail for: ${videoFile.title}`);

    const id = deriveThumbnailId(videoFile.scriptId);
    await mkdir(THUMBNAIL_DIR, { recursive: true });

    const thumbnailPath = path.join(THUMBNAIL_DIR, `${id}.jpg`);

    // Extract frame at 10% of total duration — past any potential black intro frames
    const frameTime = Math.max(1, Math.floor(videoFile.durationSeconds * 0.1));

    await extractFrameWithTitle(
      videoFile.videoPath,
      thumbnailPath,
      frameTime,
      metadataFile.title,
    );

    console.log(`✅ Thumbnail saved: ${thumbnailPath}`);

    const thumbnailRecord: ThumbnailFile = {
      id,
      scriptId: videoFile.scriptId,
      videoId: videoFile.id,
      title: metadataFile.title,
      thumbnailPath,
      sourceAssetPath: videoFile.videoPath,
      frameTimeSeconds: frameTime,
      createdAt: now(),
    };

    await storage.save("media/thumbnails", id, thumbnailRecord);
    return thumbnailRecord;
  }
}
