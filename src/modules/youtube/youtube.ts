import { storage } from "../storage";
import { deriveMetadataId } from "../id-generator";
import { now } from "../story/base";
import { uploadVideo, type Visibility } from "./uploader";
import { type VideoFile } from "../media/renderer";
import { type MetadataFile } from "../media/metadata";
import { analyticsService } from "../../services/analytics.service";

export interface UploadFile {
  id: string;           // UPL-GEN-DATE-SEQ — reuses META id with UPL prefix
  scriptId: string;
  videoId: string;      // internal VID-* id
  youtubeId: string;    // YouTube's video ID
  url: string;
  visibility: Visibility;
  title: string;
  uploadedAt: string;
  createdAt: string;
}

/**
 * High-level upload orchestrator.
 * Calls uploader.ts, saves the result, and returns a full UploadFile record.
 */
export async function publishVideo(
  video: VideoFile,
  metadata: MetadataFile,
  visibility: Visibility = "private",
): Promise<UploadFile> {
  const result = await uploadVideo(video, metadata, visibility);

  // Derive upload ID from the same script lineage — UPL shares genre/date/seq
  // We reuse the META id derivation since it takes scriptId as input
  const metaId = deriveMetadataId(video.scriptId);
  const uploadId = metaId.replace(/^META-/, "UPL-");

  const uploadFile: UploadFile = {
    id: uploadId,
    scriptId: video.scriptId,
    videoId: video.id,
    youtubeId: result.youtubeId,
    url: result.url,
    visibility: result.visibility,
    title: metadata.title,
    uploadedAt: result.uploadedAt,
    createdAt: now(),
  };

  await storage.save("media/uploads", uploadId, uploadFile);

  // Create an analytics record so this video can be tracked over time.
  // Stats start at zero — POST /analytics/refresh will populate them.
  await analyticsService.create({
    runId:       undefined,   // not available here — can be back-filled via the queue
    videoId:     video.id,
    youtubeId:   result.youtubeId,
    thumbnailId: undefined,   // back-filled by the queue when the run completes
    genre:       metadata.category, // closest available field — genre stored here
    title:       metadata.title,
    publishedAt: result.uploadedAt,
  }).catch((err) => {
    // Non-fatal — analytics record creation failing should not fail the upload
    console.warn(`[analytics] Failed to create record for ${result.youtubeId}: ${(err as Error).message}`);
  });

  return uploadFile;
}
