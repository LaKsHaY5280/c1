import { storage } from "../storage";
import { deriveMetadataId } from "../id-generator";
import { now } from "../story/base";
import { uploadVideo, type Visibility } from "./uploader";
import { type VideoFile } from "../media/renderer";
import { type MetadataFile } from "../media/metadata";

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

  return uploadFile;
}
