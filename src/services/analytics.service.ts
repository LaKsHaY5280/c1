/**
 * Analytics service — stores and retrieves performance data for uploaded videos.
 *
 * Each AnalyticsRecord is created when a video is uploaded and updated by calling
 * analytics.fetch(youtubeId) which hits the YouTube Data API v3 /videos?part=statistics.
 *
 * Storage: data/analytics/ANL-YYYYMMDD-NNN.json
 *
 * Score formula (simple weighted engagement):
 *   score = views + (likes * 3) + (comments * 5)
 *
 * Genre averages and ranking are computed in-memory from the stored records
 * when the API calls getAll() — no separate aggregation file needed at this scale.
 */

import fs from "fs/promises";
import path from "path";
import { AssetType, generateTypedId } from "../modules/id-generator";
import { createYouTubeClient } from "../modules/youtube/client";

const ANALYTICS_DIR = path.join(process.cwd(), "data", "analytics");

export interface AnalyticsRecord {
  id: string;           // ANL-YYYYMMDD-NNN
  runId?: string;
  videoId: string;      // internal VID-* id
  youtubeId: string;    // YouTube video ID
  thumbnailId?: string; // THM-* id
  genre: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  score: number;        // computed: views + likes*3 + comments*5
  retrievedAt: string;  // last time stats were fetched
  publishedAt?: string; // YouTube publish date
  createdAt: string;
}

export interface GenreAverage {
  genre: string;
  count: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgScore: number;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });
}

async function getNextSequence(): Promise<number> {
  await ensureDir();
  const files = await fs.readdir(ANALYTICS_DIR);
  return files.filter((f) => f.endsWith(".json")).length + 1;
}

async function save(record: AnalyticsRecord): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    path.join(ANALYTICS_DIR, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

async function loadFile(filename: string): Promise<AnalyticsRecord | null> {
  try {
    const content = await fs.readFile(path.join(ANALYTICS_DIR, filename), "utf-8");
    if (!content.trim()) return null;
    return JSON.parse(content) as AnalyticsRecord;
  } catch {
    return null;
  }
}

// ─── Score ────────────────────────────────────────────────────────────────────

function computeScore(views: number, likes: number, comments: number): number {
  return views + likes * 3 + comments * 5;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getAll(): Promise<AnalyticsRecord[]> {
  await ensureDir();
  const files = await fs.readdir(ANALYTICS_DIR);
  const records: AnalyticsRecord[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const r = await loadFile(file);
    if (r) records.push(r);
  }
  return records.sort((a, b) => b.score - a.score); // best performers first
}

async function getById(id: string): Promise<AnalyticsRecord | null> {
  return loadFile(`${id}.json`);
}

async function getByYoutubeId(youtubeId: string): Promise<AnalyticsRecord | null> {
  const all = await getAll();
  return all.find((r) => r.youtubeId === youtubeId) ?? null;
}

/**
 * Create a new analytics record for a freshly uploaded video.
 * Stats are zero at creation time — call refreshRecord() to populate them.
 */
async function create(params: {
  runId?: string;
  videoId: string;
  youtubeId: string;
  thumbnailId?: string;
  genre: string;
  title: string;
  publishedAt?: string;
}): Promise<AnalyticsRecord> {
  const seq = await getNextSequence();
  const id = generateTypedId(AssetType.ANALYTICS, seq);
  const ts = new Date().toISOString();

  const record: AnalyticsRecord = {
    id,
    ...params,
    views: 0,
    likes: 0,
    comments: 0,
    score: 0,
    retrievedAt: ts,
    createdAt: ts,
  };

  await save(record);
  return record;
}

/**
 * Fetch live stats from YouTube for a single record and persist the update.
 * Uses the youtube.videos.list API with part=statistics,snippet.
 */
async function refreshRecord(record: AnalyticsRecord): Promise<AnalyticsRecord> {
  const youtube = createYouTubeClient();

  const response = await youtube.videos.list({
    part: ["statistics", "snippet"],
    id: [record.youtubeId],
  });

  const item = response.data.items?.[0];
  if (!item) {
    console.warn(`[analytics] No YouTube data for ${record.youtubeId} — skipping`);
    return record;
  }

  const stats = item.statistics ?? {};
  const views    = parseInt(stats.viewCount    ?? "0", 10);
  const likes    = parseInt(stats.likeCount    ?? "0", 10);
  const comments = parseInt(stats.commentCount ?? "0", 10);
  const publishedAt = item.snippet?.publishedAt ?? record.publishedAt;

  const updated: AnalyticsRecord = {
    ...record,
    views,
    likes,
    comments,
    score: computeScore(views, likes, comments),
    publishedAt,
    retrievedAt: new Date().toISOString(),
  };

  await save(updated);
  return updated;
}

/**
 * Refresh stats for every record in data/analytics/.
 * Called by POST /analytics/refresh.
 * Returns a summary of how many were updated.
 */
async function refreshAll(): Promise<{ updated: number; errors: number }> {
  const records = await getAll();
  let updated = 0;
  let errors  = 0;

  for (const record of records) {
    try {
      await refreshRecord(record);
      updated++;
    } catch (err) {
      console.error(`[analytics] Failed to refresh ${record.youtubeId}: ${(err as Error).message}`);
      errors++;
    }
  }

  return { updated, errors };
}

/**
 * Compute average performance per genre across all stored records.
 */
async function getGenreAverages(): Promise<GenreAverage[]> {
  const records = await getAll();
  const grouped = new Map<string, AnalyticsRecord[]>();

  for (const r of records) {
    const list = grouped.get(r.genre) ?? [];
    list.push(r);
    grouped.set(r.genre, list);
  }

  const averages: GenreAverage[] = [];
  for (const [genre, list] of grouped) {
    const count = list.length;
    averages.push({
      genre,
      count,
      avgViews:    Math.round(list.reduce((s, r) => s + r.views,    0) / count),
      avgLikes:    Math.round(list.reduce((s, r) => s + r.likes,    0) / count),
      avgComments: Math.round(list.reduce((s, r) => s + r.comments, 0) / count),
      avgScore:    Math.round(list.reduce((s, r) => s + r.score,    0) / count),
    });
  }

  return averages.sort((a, b) => b.avgScore - a.avgScore);
}

export const analyticsService = {
  create,
  getAll,
  getById,
  getByYoutubeId,
  refreshRecord,
  refreshAll,
  getGenreAverages,
};
