/**
 * Feedback service — derives human-readable recommendations from analytics data.
 *
 * This is a pure computation layer: no storage, no external calls.
 * Call computeFeedback() whenever you need a fresh report — it reads all
 * analytics records and applies a set of deterministic rules.
 *
 * Design principle: recommendations only.
 * The system suggests; the user decides.
 * Nothing here touches the queue or changes any settings automatically.
 *
 * Rules applied (all require ≥ MIN_RECORDS records to fire):
 *   1. genre_ranking       — best and worst performing genres by avg score
 *   2. title_length        — short titles (≤40 chars) vs long titles
 *   3. engagement_ratio    — genres with above-average likes+comments per view
 *   4. underperformer      — genres scoring below the global mean
 *   5. growth_trend        — recent 5 videos vs prior 5 — direction of change
 *   6. best_schedule_day   — which day-of-week has the highest avg score
 *   7. consistency_signal  — most-tested genre (most reliable signal)
 */

import { analyticsService, type AnalyticsRecord } from "./analytics.service";

// Minimum records needed before a rule fires.
// Keeps feedback silent when the dataset is too small to be meaningful.
const MIN_RECORDS = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedbackCategory =
  | "genre"
  | "title"
  | "engagement"
  | "schedule"
  | "trend"
  | "signal";

export type FeedbackPriority = "high" | "medium" | "low";

export interface FeedbackItem {
  id: string;                    // stable slug e.g. "genre_ranking"
  category: FeedbackCategory;
  priority: FeedbackPriority;
  headline: string;              // one-line summary for the card header
  detail: string;                // 1–2 sentences explaining the data behind it
  recommendation: string;        // actionable plain-English suggestion
  data?: Record<string, unknown>; // optional supporting numbers for the UI
}

export interface FeedbackReport {
  generatedAt: string;
  recordCount: number;
  items: FeedbackItem[];
  recommendedGenres: string[];   // ordered best → worst
  titleGuidance: string;         // "short" | "long" | "neutral"
  scheduleInsight: string | null; // best day-of-week, or null if insufficient data
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleLength(title: string): "short" | "long" {
  return title.length <= 40 ? "short" : "long";
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Rule implementations ─────────────────────────────────────────────────────

function ruleGenreRanking(
  records: AnalyticsRecord[],
  genreMap: Map<string, AnalyticsRecord[]>,
): FeedbackItem | null {
  if (genreMap.size < 2) return null;

  const ranked = [...genreMap.entries()]
    .map(([genre, recs]) => ({ genre, avgScore: Math.round(avg(recs.map((r) => r.score))) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const best  = ranked[0];
  const worst = ranked[ranked.length - 1];

  // Only fire if there's a meaningful gap (worst < 75% of best)
  if (best.avgScore === 0 || worst.avgScore / best.avgScore > 0.75) return null;

  return {
    id: "genre_ranking",
    category: "genre",
    priority: "high",
    headline: `${capitalize(best.genre)} outperforms ${capitalize(worst.genre)}`,
    detail: `${capitalize(best.genre)} averages a score of ${best.avgScore.toLocaleString()} vs ${worst.avgScore.toLocaleString()} for ${capitalize(worst.genre)} across ${records.length} videos.`,
    recommendation: `Prioritise ${capitalize(best.genre)} in your queue. Consider reducing ${capitalize(worst.genre)} slots until it improves or you have more data.`,
    data: { ranked },
  };
}

function ruleTitleLength(records: AnalyticsRecord[]): FeedbackItem | null {
  const short = records.filter((r) => titleLength(r.title) === "short");
  const long  = records.filter((r) => titleLength(r.title) === "long");

  if (short.length < 2 || long.length < 2) return null;

  const avgShort = Math.round(avg(short.map((r) => r.score)));
  const avgLong  = Math.round(avg(long.map((r) => r.score)));
  const diff     = Math.abs(avgShort - avgLong);

  // Only fire if the gap is meaningful (> 10% of the higher value)
  if (diff / Math.max(avgShort, avgLong) < 0.10) return null;

  const winner: "short" | "long" = avgShort >= avgLong ? "short" : "long";

  return {
    id: "title_length",
    category: "title",
    priority: "medium",
    headline: `${capitalize(winner)} titles perform better`,
    detail: `${capitalize(winner)} titles (${winner === "short" ? "≤40" : ">40"} chars) score an average of ${Math.max(avgShort, avgLong).toLocaleString()} vs ${Math.min(avgShort, avgLong).toLocaleString()} for ${winner === "short" ? "long" : "short"} titles.`,
    recommendation: `Write titles that are ${winner === "short" ? "punchy and under 40 characters" : "more descriptive — your audience responds to detail"}.`,
    data: { avgShort, avgLong, shortCount: short.length, longCount: long.length },
  };
}

function ruleEngagementRatio(
  genreMap: Map<string, AnalyticsRecord[]>,
): FeedbackItem | null {
  if (genreMap.size < 2) return null;

  // engagement ratio = (likes + comments) / views  (skip genres with 0 views)
  const ratios = [...genreMap.entries()]
    .map(([genre, recs]) => {
      const totalViews    = recs.reduce((s, r) => s + r.views,    0);
      const totalEngaged  = recs.reduce((s, r) => s + r.likes + r.comments, 0);
      const ratio = totalViews > 0 ? totalEngaged / totalViews : 0;
      return { genre, ratio, count: recs.length };
    })
    .filter((g) => g.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);

  if (ratios.length < 2) return null;

  const best = ratios[0];
  const globalRatio = avg(ratios.map((r) => r.ratio));

  // Only fire if the top genre is meaningfully above average
  if (best.ratio < globalRatio * 1.2) return null;

  const pct = Math.round(best.ratio * 100);

  return {
    id: "engagement_ratio",
    category: "engagement",
    priority: "medium",
    headline: `${capitalize(best.genre)} drives the most engagement`,
    detail: `${capitalize(best.genre)} earns ${pct}% engagement rate (likes + comments per view) — above the channel average of ${Math.round(globalRatio * 100)}%.`,
    recommendation: `Lean into the ${capitalize(best.genre)} style — your audience is most interactive with it. Study what those titles and thumbnails have in common.`,
    data: { ratios },
  };
}

function ruleUnderperformer(
  genreMap: Map<string, AnalyticsRecord[]>,
): FeedbackItem | null {
  if (genreMap.size < 2) return null;

  const genreScores = [...genreMap.entries()].map(([genre, recs]) => ({
    genre,
    avgScore: Math.round(avg(recs.map((r) => r.score))),
    count: recs.length,
  }));

  const globalMean = avg(genreScores.map((g) => g.avgScore));
  if (globalMean === 0) return null;

  // Genres scoring less than 50% of the global mean with at least 2 videos
  const underperformers = genreScores
    .filter((g) => g.avgScore < globalMean * 0.5 && g.count >= 2)
    .sort((a, b) => a.avgScore - b.avgScore);

  if (!underperformers.length) return null;

  const worst = underperformers[0];

  return {
    id: "underperformer",
    category: "genre",
    priority: "high",
    headline: `${capitalize(worst.genre)} is significantly underperforming`,
    detail: `${capitalize(worst.genre)} averages ${worst.avgScore.toLocaleString()} — less than half the channel mean of ${Math.round(globalMean).toLocaleString()}.`,
    recommendation: `Pause ${capitalize(worst.genre)} slots in the queue and review what makes its content different. Either improve the prompt strategy or deprioritise the genre.`,
    data: { genre: worst.genre, avgScore: worst.avgScore, globalMean: Math.round(globalMean) },
  };
}

function ruleGrowthTrend(records: AnalyticsRecord[]): FeedbackItem | null {
  // Needs at least 10 records to compare two meaningful windows
  if (records.length < 10) return null;

  const sorted = [...records]
    .filter((r) => r.publishedAt)
    .sort((a, b) => new Date(a.publishedAt!).getTime() - new Date(b.publishedAt!).getTime());

  if (sorted.length < 10) return null;

  const half   = Math.floor(sorted.length / 2);
  const older  = sorted.slice(0, half);
  const recent = sorted.slice(-half);

  const avgOlder  = Math.round(avg(older.map((r) => r.score)));
  const avgRecent = Math.round(avg(recent.map((r) => r.score)));

  if (avgOlder === 0) return null;

  const changePct = Math.round(((avgRecent - avgOlder) / avgOlder) * 100);

  // Only fire if the change is at least ±15%
  if (Math.abs(changePct) < 15) return null;

  const direction = changePct > 0 ? "up" : "down";

  return {
    id: "growth_trend",
    category: "trend",
    priority: changePct < -15 ? "high" : "medium",
    headline: `Performance is trending ${direction} ${Math.abs(changePct)}%`,
    detail: `Your most recent ${half} videos average a score of ${avgRecent.toLocaleString()} vs ${avgOlder.toLocaleString()} for the ${half} before them.`,
    recommendation: direction === "up"
      ? "Keep the current strategy — recent content is outperforming older content. Note what genres and title styles are working."
      : "Performance is declining. Look at recent videos vs older ones — check for genre drift, title quality, or thumbnail changes.",
    data: { avgOlder, avgRecent, changePct, windowSize: half },
  };
}

function ruleBestScheduleDay(records: AnalyticsRecord[]): FeedbackItem | null {
  const byDay = new Map<number, number[]>(); // 0=Sun … 6=Sat → scores[]

  for (const r of records) {
    if (!r.publishedAt) continue;
    const day = new Date(r.publishedAt).getDay();
    const list = byDay.get(day) ?? [];
    list.push(r.score);
    byDay.set(day, list);
  }

  // Need at least 3 days covered with at least 2 videos each
  const qualified = [...byDay.entries()].filter(([, scores]) => scores.length >= 2);
  if (qualified.length < 3) return null;

  const ranked = qualified
    .map(([day, scores]) => ({ day, avgScore: Math.round(avg(scores)), count: scores.length }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const best  = ranked[0];
  const worst = ranked[ranked.length - 1];

  if (best.avgScore === 0 || worst.avgScore / best.avgScore > 0.80) return null;

  return {
    id: "best_schedule_day",
    category: "schedule",
    priority: "low",
    headline: `${DAY_NAMES[best.day]} is your best upload day`,
    detail: `Videos published on ${DAY_NAMES[best.day]} average ${best.avgScore.toLocaleString()} vs ${best.avgScore.toLocaleString() !== worst.avgScore.toLocaleString() ? worst.avgScore.toLocaleString() : "lower"} on ${DAY_NAMES[worst.day]}.`,
    recommendation: `Schedule more of your high-priority content on ${DAY_NAMES[best.day]}. Avoid ${DAY_NAMES[worst.day]} for releases you care most about.`,
    data: { ranked },
  };
}

function ruleConsistencySignal(
  genreMap: Map<string, AnalyticsRecord[]>,
): FeedbackItem | null {
  if (genreMap.size < 2) return null;

  const sorted = [...genreMap.entries()]
    .map(([genre, recs]) => ({ genre, count: recs.length }))
    .sort((a, b) => b.count - a.count);

  const most = sorted[0];
  if (most.count < 3) return null; // need at least 3 to be "consistent"

  const avgScore = Math.round(
    avg(genreMap.get(most.genre)!.map((r) => r.score)),
  );

  return {
    id: "consistency_signal",
    category: "signal",
    priority: "low",
    headline: `${capitalize(most.genre)} has the most data`,
    detail: `${capitalize(most.genre)} has ${most.count} published videos — the most of any genre — with an average score of ${avgScore.toLocaleString()}.`,
    recommendation: `${capitalize(most.genre)} is your most reliable signal. Use it as a benchmark when evaluating other genres.`,
    data: { genre: most.genre, count: most.count, avgScore },
  };
}

// ─── Main compute function ────────────────────────────────────────────────────

export async function computeFeedback(): Promise<FeedbackReport> {
  const records = await analyticsService.getAll();

  // Build genre map once — reused by multiple rules
  const genreMap = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const list = genreMap.get(r.genre) ?? [];
    list.push(r);
    genreMap.set(r.genre, list);
  }

  const items: FeedbackItem[] = [];

  if (records.length >= MIN_RECORDS) {
    const results = [
      ruleGenreRanking(records, genreMap),
      ruleUnderperformer(genreMap),
      ruleGrowthTrend(records),
      ruleTitleLength(records),
      ruleEngagementRatio(genreMap),
      ruleBestScheduleDay(records),
      ruleConsistencySignal(genreMap),
    ];

    for (const item of results) {
      if (item) items.push(item);
    }
  }

  // Sort: high → medium → low
  const priorityOrder: Record<FeedbackPriority, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Build top-level guidance from the available rules
  const genreRankingItem = items.find((i) => i.id === "genre_ranking");
  const recommendedGenres = genreRankingItem
    ? (genreRankingItem.data?.ranked as { genre: string }[]).map((r) => r.genre)
    : [...genreMap.keys()];

  const titleItem = items.find((i) => i.id === "title_length");
  const titleGuidance: string =
    (titleItem?.data?.["avgShort"] as number) >= (titleItem?.data?.["avgLong"] as number)
      ? "short"
      : titleItem
      ? "long"
      : "neutral";

  const scheduleItem = items.find((i) => i.id === "best_schedule_day");
  const scheduleInsight: string | null = scheduleItem
    ? DAY_NAMES[(scheduleItem.data?.ranked as { day: number }[])?.[0]?.day ?? -1] ?? null
    : null;

  return {
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    items,
    recommendedGenres,
    titleGuidance,
    scheduleInsight,
  };
}

export const feedbackService = { computeFeedback };
