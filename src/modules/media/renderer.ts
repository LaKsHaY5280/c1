import path from "path";
import { mkdir, rm } from "fs/promises";
import { storage } from "../storage";
import { deriveVideoId } from "../id-generator";
import { now } from "../story/base";
import { type AssetManifest } from "./downloader";
import { type VoiceFile } from "./voice";
import { type CaptionFile } from "./caption";
import {
  photoToClip,
  videoToClip,
  concatenateClips,
  burnCaptionsAndMuxAudio,
} from "./ffmpeg-utils";
import type { CancellationToken } from "../../pipeline/cancellation";

const VIDEO_DIR = path.join(process.cwd(), "output", "videos");
const TMP_DIR   = path.join(process.cwd(), "data",   "tmp");

export interface VideoFile {
  id: string;
  scriptId: string;
  title: string;
  videoPath: string;
  durationSeconds: number;
  sceneCount: number;
  createdAt: string;
}

export class Renderer {
  /**
   * Compose all pipeline assets into a final vertical MP4.
   *
   * @param token  Optional cancellation token. When present, each ffmpeg
   *               command is registered so it can be killed immediately if
   *               the user cancels while a clip is being encoded.
   */
  async render(
    manifest:    AssetManifest,
    sceneMap:    Map<string, number>,
    voiceFile:   VoiceFile,
    captionFile: CaptionFile,
    token?:      CancellationToken,
  ): Promise<VideoFile> {
    const scriptId = voiceFile.scriptId;
    const id = deriveVideoId(scriptId);

    console.log(`🎬 Rendering video: ${voiceFile.title}`);

    const sortedAssets = [...manifest.assets].sort((a, b) =>
      a.sceneId.localeCompare(b.sceneId),
    );

    const runTmpDir = path.join(TMP_DIR, id);
    await mkdir(runTmpDir, { recursive: true });
    await mkdir(VIDEO_DIR, { recursive: true });

    /**
     * Wrap an ffmpeg Promise so:
     * 1. The command is registered on the token before execution starts.
     * 2. It is deregistered (set to null) when the command finishes.
     * 3. If the token is already cancelled before we start, we throw immediately.
     */
    function runFfmpeg(fn: (onCmd: (cmd: import("fluent-ffmpeg").FfmpegCommand) => void) => Promise<void>): Promise<void> {
      token?.throwIfCancelled();
      return new Promise<void>((resolve, reject) => {
        fn((cmd) => token?.setFfmpegProcess(cmd))
          .then(() => { token?.setFfmpegProcess(null); resolve(); })
          .catch((err) => { token?.setFfmpegProcess(null); reject(err); });
      });
    }

    try {
      console.log(`  📽  Building ${sortedAssets.length} scene clips...`);
      const clipPaths: string[] = [];

      for (const asset of sortedAssets) {
        token?.throwIfCancelled();
        const duration = sceneMap.get(asset.sceneId) ?? 10;
        const clipPath = path.join(runTmpDir, `${asset.sceneId}.mp4`);

        if (asset.mediaType === "video") {
          console.log(`    [video] ${asset.sceneId} — ${duration}s`);
          await runFfmpeg((reg) => videoToClip(asset.assetPath, clipPath, duration, reg));
        } else {
          console.log(`    [photo] ${asset.sceneId} — ${duration}s`);
          await runFfmpeg((reg) => photoToClip(asset.assetPath, clipPath, duration, reg));
        }

        clipPaths.push(clipPath);
      }

      token?.throwIfCancelled();
      console.log(`  🔗 Concatenating clips...`);
      const silentVideoPath = path.join(runTmpDir, `${id}.silent.mp4`);
      await runFfmpeg((reg) => concatenateClips(clipPaths, silentVideoPath, runTmpDir, reg));

      token?.throwIfCancelled();
      console.log(`  🔊 Muxing audio and burning captions...`);
      const videoPath = path.join(VIDEO_DIR, `${id}.mp4`);
      await runFfmpeg((reg) => burnCaptionsAndMuxAudio(
        silentVideoPath, voiceFile.audioPath, captionFile.srtPath, videoPath, reg,
      ));

      const totalDuration = sortedAssets.reduce(
        (sum, a) => sum + (sceneMap.get(a.sceneId) ?? 10), 0,
      );

      const videoFile: VideoFile = {
        id, scriptId,
        title: voiceFile.title,
        videoPath,
        durationSeconds: totalDuration,
        sceneCount: sortedAssets.length,
        createdAt: now(),
      };

      await storage.save("media/videos", id, videoFile);
      console.log(`✅ Video saved: ${videoPath}`);
      return videoFile;

    } finally {
      await rm(runTmpDir, { recursive: true, force: true });
    }
  }
}
