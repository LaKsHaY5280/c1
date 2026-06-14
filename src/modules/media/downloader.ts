import { mkdir, writeFile } from "fs/promises";
import path from "path";

export interface DownloadInput {
  sceneId: string;
  url: string;
  ext?: string;        // "jpg" | "mp4" — defaults to "jpg"
  mediaType?: string;  // "photo" | "video" — recorded in manifest
  pexelsId?: number;
  credit?: string;     // photographer or videographer name
  pexelsUrl?: string;  // Pexels page URL for attribution
}

export interface DownloadedAsset {
  sceneId: string;
  assetPath: string;
  mediaType: string;
  pexelsId?: number;
  credit?: string;
  pexelsUrl?: string;
  createdAt: string;
}

export interface AssetManifest {
  runId: string;      // scene file ID (SCN-*) — ties manifest to a pipeline run
  assets: DownloadedAsset[];
  createdAt: string;
}

const OUTPUT_DIR = path.join(process.cwd(), "data", "assets");

export class Downloader {
  async download(input: DownloadInput): Promise<DownloadedAsset> {
    const ext = input.ext ?? "jpg";

    console.log(`⬇️  Downloading ${input.sceneId}.${ext}`);

    const response = await fetch(input.url);

    if (!response.ok) {
      throw new Error(
        `Download failed for ${input.sceneId}: ${response.status} ${response.statusText}`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await mkdir(OUTPUT_DIR, { recursive: true });

    const assetPath = path.join(OUTPUT_DIR, `${input.sceneId}.${ext}`);
    await writeFile(assetPath, buffer);

    console.log(`✅ Saved: ${assetPath}`);

    return {
      sceneId: input.sceneId,
      assetPath,
      mediaType: input.mediaType ?? ext,
      pexelsId: input.pexelsId,
      credit: input.credit,
      pexelsUrl: input.pexelsUrl,
      createdAt: new Date().toISOString(),
    };
  }

  async downloadAll(inputs: DownloadInput[]): Promise<DownloadedAsset[]> {
    const results: DownloadedAsset[] = [];
    for (const input of inputs) {
      const result = await this.download(input);
      results.push(result);
    }
    return results;
  }

  async saveManifest(runId: string, assets: DownloadedAsset[]): Promise<string> {
    const manifest: AssetManifest = {
      runId,
      assets,
      createdAt: new Date().toISOString(),
    };

    await mkdir(OUTPUT_DIR, { recursive: true });

    const manifestPath = path.join(OUTPUT_DIR, `${runId}.manifest.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    console.log(`📋 Manifest saved: ${manifestPath}`);
    return manifestPath;
  }
}

export const downloader = new Downloader();
