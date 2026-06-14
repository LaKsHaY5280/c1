import { env } from "../../config/env";

export interface PexelsPhoto {
  id: number;
  url: string;           // Pexels page URL
  photographer: string;
  photographerUrl: string;
  imageUrl: string;      // direct download URL (original size)
  width: number;
  height: number;
}

export interface PexelsVideo {
  id: number;
  url: string;           // Pexels page URL
  videographer: string;
  videoUrl: string;      // direct download URL (best quality)
  width: number;
  height: number;
  duration: number;      // seconds
}

// Pexels API response shapes
interface PexelsPhotoResponse {
  photos: Array<{
    id: number;
    url: string;
    photographer: string;
    photographer_url: string;
    width: number;
    height: number;
    src: { original: string };
  }>;
}

interface PexelsVideoResponse {
  videos: Array<{
    id: number;
    url: string;
    user: { name: string };
    width: number;
    height: number;
    duration: number;
    video_files: Array<{
      quality: string;
      link: string;
      width: number;
      height: number;
    }>;
  }>;
}

export class PexelsClient {
  private readonly baseUrl = "https://api.pexels.com";
  private readonly headers: Record<string, string>;

  constructor() {
    if (!env.pexelsApiKey) throw new Error("PEXELS_API_KEY is not set in .env");
    this.headers = { Authorization: env.pexelsApiKey };
  }

  async searchPhotos(query: string, perPage = 5): Promise<PexelsPhoto[]> {
    const url = new URL(`${this.baseUrl}/v1/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("orientation", "portrait"); // vertical for Shorts

    const response = await fetch(url.toString(), { headers: this.headers });

    if (!response.ok) {
      throw new Error(`Pexels photo search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PexelsPhotoResponse;

    return data.photos.map((p) => ({
      id: p.id,
      url: p.url,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      imageUrl: p.src.original,
      width: p.width,
      height: p.height,
    }));
  }

  async searchVideos(query: string, perPage = 5): Promise<PexelsVideo[]> {
    const url = new URL(`${this.baseUrl}/videos/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("orientation", "portrait");

    const response = await fetch(url.toString(), { headers: this.headers });

    if (!response.ok) {
      throw new Error(`Pexels video search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PexelsVideoResponse;

    return data.videos.map((v) => {
      // pick the highest resolution video file available
      const best = v.video_files
        .filter((f) => f.quality === "hd" || f.quality === "sd")
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

      return {
        id: v.id,
        url: v.url,
        videographer: v.user.name,
        videoUrl: best?.link ?? "",
        width: v.width,
        height: v.height,
        duration: v.duration,
      };
    });
  }
}

export const pexels = new PexelsClient();
