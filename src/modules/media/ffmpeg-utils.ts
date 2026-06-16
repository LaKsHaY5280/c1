import ffmpeg, { type FfmpegCommand } from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import { mkdir } from "fs/promises";

// Point fluent-ffmpeg at the bundled binary — no system ffmpeg needed
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const VIDEO_WIDTH  = 1080;
export const VIDEO_HEIGHT = 1920;

export const SCALE_CROP_FILTER =
  `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
  `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`;

/**
 * Optional callback the renderer passes in to register the ffmpeg command
 * with the cancellation token, enabling kill() on cancel.
 */
type RegisterCmd = (cmd: FfmpegCommand) => void;

export function photoToClip(
  imagePath:  string,
  outputPath: string,
  duration:   number,
  onCmd?:     RegisterCmd,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const frames  = Math.ceil(duration * 25);
    const zoomPan =
      `zoompan=z='min(zoom+0.0008,1.05)':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=25`;

    const cmd = ffmpeg(imagePath)
      .inputOptions(["-loop 1"])
      .videoFilter([zoomPan, `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`])
      .outputOptions([`-t ${duration}`, "-c:v libx264", "-pix_fmt yuv420p", "-r 25", "-an"])
      .output(outputPath)
      .on("end",   () => resolve())
      .on("error", (err) => reject(new Error(`photoToClip failed: ${err.message}`)));

    onCmd?.(cmd);
    cmd.run();
  });
}

export function videoToClip(
  videoPath:  string,
  outputPath: string,
  duration:   number,
  onCmd?:     RegisterCmd,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .inputOptions(["-ss 0"])
      .videoFilter(SCALE_CROP_FILTER)
      .outputOptions([`-t ${duration}`, "-c:v libx264", "-pix_fmt yuv420p", "-r 25", "-an"])
      .output(outputPath)
      .on("end",   () => resolve())
      .on("error", (err) => reject(new Error(`videoToClip failed: ${err.message}`)));

    onCmd?.(cmd);
    cmd.run();
  });
}

export async function concatenateClips(
  clipPaths:  string[],
  outputPath: string,
  tmpDir:     string,
  onCmd?:     RegisterCmd,
): Promise<void> {
  const listPath    = path.join(tmpDir, "concat.txt");
  const listContent = clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");

  await mkdir(tmpDir, { recursive: true });
  const { writeFile } = await import("fs/promises");
  await writeFile(listPath, listContent, "utf-8");

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end",   () => resolve())
      .on("error", (err) => reject(new Error(`concatenateClips failed: ${err.message}`)));

    onCmd?.(cmd);
    cmd.run();
  });
}

export function burnCaptionsAndMuxAudio(
  videoPath:  string,
  audioPath:  string,
  srtPath:    string,
  outputPath: string,
  onCmd?:     RegisterCmd,
): Promise<void> {
  const srtSafe = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .input(audioPath)
      .videoFilter(
        `subtitles='${srtSafe}':force_style=` +
        `'FontName=Arial,FontSize=18,PrimaryColour=&Hffffff,` +
        `OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=60'`,
      )
      .outputOptions(["-c:v libx264", "-pix_fmt yuv420p", "-c:a aac", "-shortest", "-r 25"])
      .output(outputPath)
      .on("end",   () => resolve())
      .on("error", (err) => reject(new Error(`burnCaptionsAndMuxAudio failed: ${err.message}`)));

    onCmd?.(cmd);
    cmd.run();
  });
}
