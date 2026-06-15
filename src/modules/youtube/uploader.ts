import { createReadStream } from "fs";
import { createYouTubeClient } from "./client";
import { type MetadataFile } from "../media/metadata";
import { type VideoFile } from "../media/renderer";

// Category ID mapping for YouTube — numeric IDs required by the API
// Full list: https://developers.google.com/youtube/v3/docs/videoCategories/list
const CATEGORY_IDS: Record<string, string> = {
  "Film & Animation":      "1",
  "Entertainment":         "24",
  "Science & Technology":  "28",
  "Education":             "27",
  "People & Blogs":        "22",
};

const FALLBACK_CATEGORY_ID = "24"; // Entertainment

export type Visibility = "private" | "unlisted" | "public";

export interface UploadResult {
  youtubeId: string;    // YouTube's video ID e.g. "dQw4w9WgXcQ"
  url: string;          // https://youtube.com/watch?v=dQw4w9WgXcQ
  visibility: Visibility;
  uploadedAt: string;
}

/**
 * Uploads a rendered video to YouTube using metadata from the pipeline.
 * Defaults to "private" — change visibility only after manual review.
 */
export async function uploadVideo(
  video: VideoFile,
  metadata: MetadataFile,
  visibility: Visibility = "private",
): Promise<UploadResult> {
  const youtube = createYouTubeClient();

  const categoryId = CATEGORY_IDS[metadata.category] ?? FALLBACK_CATEGORY_ID;

  // Combine description + hashtags into the YouTube description field
  const fullDescription =
    `${metadata.description}\n\n${metadata.hashtags.join(" ")}`;

  console.log(`📤 Uploading to YouTube: "${metadata.title}"`);
  console.log(`   Visibility: ${visibility}`);

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: metadata.title,
        description: fullDescription,
        tags: metadata.tags,
        categoryId,
        defaultLanguage: metadata.language,
        defaultAudioLanguage: metadata.language,
      },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: "video/mp4",
      body: createReadStream(video.videoPath),
    },
  });

  const youtubeId = response.data.id;

  if (!youtubeId) {
    throw new Error("YouTube upload succeeded but returned no video ID");
  }

  const url = `https://youtube.com/watch?v=${youtubeId}`;
  console.log(`✅ Uploaded: ${url}`);

  return {
    youtubeId,
    url,
    visibility,
    uploadedAt: new Date().toISOString(),
  };
}
