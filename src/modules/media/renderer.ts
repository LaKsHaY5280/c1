import path from "path";
import { mkdir, rm } from "fs/promises";
import { storage } from "../storage";
import { deriveVideoId } from "../id-generator";
import { now } from "../story/base";
import { type AssetManifest, type DownloadedAsset } from "./downloader";
import { type VoiceFile } from "./voice";
import { type CaptionFile } from "./caption";
import {
  photoToClip,
  videoToClip,
  concatenateClips,
  burnCaptionsAndMuxAudio,
} from "./ffmpeg-utils";

const VIDEO_DIR = path.join(process.cwd(), "output", "videos");
const TMP_DIR = path.join(process.cwd(), "data", "tmp");

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
  async render(
    manifest: AssetManifest,
    sceneMap: Map<string, number>, // sceneId → duration in seconds
    voiceFile: VoiceFile,
    captionFile: CaptionFile,
  ): Promise<VideoFile> {
    const scriptId = voiceFile.scriptId;
    const id = deriveVideoId(scriptId);

    console.log(`🎬 Rendering video: ${voiceFile.title}`);

    // Sort assets by scene order using the sceneId suffix (-01, -02, ...)
    const sortedAssets = [...manifest.assets].sort((a, b) =>
      a.sceneId.localeCompare(b.sceneId),
    );

    // Prepare directories
    const runTmpDir = path.join(TMP_DIR, id);
    await mkdir(runTmpDir, { recursive: true });
    await mkdir(VIDEO_DIR, { recursive: true });

    try {
      // Step 1: Build one silent clip per scene
      console.log(`  📽  Building ${sortedAssets.length} scene clips...`);
      const clipPaths: string[] = [];

      for (const asset of sortedAssets) {
        const duration = sceneMap.get(asset.sceneId) ?? 10;
        const clipPath = path.join(runTmpDir, `${asset.sceneId}.mp4`);

        if (asset.mediaType === "video") {
          console.log(`    [video] ${asset.sceneId} — ${duration}s`);
          await videoToClip(asset.assetPath, clipPath, duration);
        } else {
          console.log(`    [photo] ${asset.sceneId} — ${duration}s`);
          await photoToClip(asset.assetPath, clipPath, duration);
        }

        clipPaths.push(clipPath);
      }

      // Step 2: Concatenate all scene clips into one silent video
      console.log(`  🔗 Concatenating clips...`);
      const silentVideoPath = path.join(runTmpDir, `${id}.silent.mp4`);
      await concatenateClips(clipPaths, silentVideoPath, runTmpDir);

      // Step 3: Burn captions + mux narration audio → final MP4
      console.log(`  🔊 Muxing audio and burning captions...`);
      const videoPath = path.join(VIDEO_DIR, `${id}.mp4`);
      await burnCaptionsAndMuxAudio(
        silentVideoPath,
        voiceFile.audioPath,
        captionFile.srtPath,
        videoPath,
      );

      const totalDuration = sortedAssets.reduce(
        (sum, a) => sum + (sceneMap.get(a.sceneId) ?? 10),
        0,
      );

      const videoFile: VideoFile = {
        id,
        scriptId,
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
      // Always clean up temp clips regardless of success or failure
      await rm(runTmpDir, { recursive: true, force: true });
    }
  }
}
