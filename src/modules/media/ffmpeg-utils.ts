import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import { mkdir } from "fs/promises";

// Point fluent-ffmpeg at the bundled binary — no system ffmpeg needed
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

// Shared ffmpeg filter for vertical 9:16 crop/scale
// scale to fill the frame, then center-crop to exact dimensions
export const SCALE_CROP_FILTER =
  `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
  `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`;

/**
 * Converts a photo to a video clip with a slow zoom-in (Ken Burns effect).
 * Output is a silent .mp4 of exactly `duration` seconds.
 */
export function photoToClip(
  imagePath: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // zoompan: starts at 1.0x zoom, ends at 1.05x over the full duration
    // d = duration * 25fps frames, s = output size, fps=25
    const frames = Math.ceil(duration * 25);
    const zoomPan =
      `zoompan=z='min(zoom+0.0008,1.05)':` +
      `x='iw/2-(iw/zoom/2)':` +
      `y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=25`;

    ffmpeg(imagePath)
      .inputOptions(["-loop 1"])
      .videoFilter([zoomPan, `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`])
      .outputOptions([
        `-t ${duration}`,
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-r 25",
        "-an", // no audio in scene clip
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`photoToClip failed: ${err.message}`)))
      .run();
  });
}

/**
 * Trims a video to `duration` seconds and crops to 9:16.
 * Output is a silent .mp4.
 */
export function videoToClip(
  videoPath: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions(["-ss 0"])
      .videoFilter(SCALE_CROP_FILTER)
      .outputOptions([
        `-t ${duration}`,
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-r 25",
        "-an",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`videoToClip failed: ${err.message}`)))
      .run();
  });
}

/**
 * Concatenates a list of silent video clips into one video.
 * Uses the concat demuxer via a temporary file list.
 */
export async function concatenateClips(
  clipPaths: string[],
  outputPath: string,
  tmpDir: string,
): Promise<void> {
  // Write concat file list
  const listPath = path.join(tmpDir, "concat.txt");
  const listContent = clipPaths
    .map((p) => `file '${p.replace(/\\/g, "/")}'`)
    .join("\n");

  await mkdir(tmpDir, { recursive: true });
  const { writeFile } = await import("fs/promises");
  await writeFile(listPath, listContent, "utf-8");

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`concatenateClips failed: ${err.message}`)))
      .run();
  });
}

/**
 * Burns SRT captions into the video and muxes in the narration audio.
 * This is the final export step.
 */
export function burnCaptionsAndMuxAudio(
  videoPath: string,
  audioPath: string,
  srtPath: string,
  outputPath: string,
): Promise<void> {
  // SRT path must use forward slashes and escaped colons for Windows ffmpeg filter
  const srtSafe = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(audioPath)
      .videoFilter(
        `subtitles='${srtSafe}':force_style=` +
        `'FontName=Arial,FontSize=18,PrimaryColour=&Hffffff,` +
        `OutlineColour=&H000000,Outline=2,Shadow=1,` +
        `Alignment=2,MarginV=60'`,
      )
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-shortest", // end when the shorter stream ends
        "-r 25",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`burnCaptionsAndMuxAudio failed: ${err.message}`)))
      .run();
  });
}
