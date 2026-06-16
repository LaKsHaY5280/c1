/**
 * Planner service — suggests the next N queue items based on analytics performance,
 * feedback recommendations, the day-of-week genre schedule, and existing queue state.
 *
 * Design principle: suggestions only.
 * This service never writes to the queue. It returns a list of PlannerSuggestion
 * objects that the user can review and approve via POST /planner/accept.
 *
 * Suggestion algorithm:
 *   1. Load all analytics records and compute per-genre avg scores.
 *   2. Load the current queue to find days that already have a pending item.
 *   3. Load settings to get the base day-of-week genre schedule.
 *   4. For each of the next N days (starting tomorrow):
 *      a. Skip if a pending/queued item already exists for that date.
 *      b. Pick the best genre for that day:
 *         - Start from the scheduled genre for that day-of-week.
 *         - If analytics data exists, boost genres that score above the channel mean
 *           and downgrade genres that underperform (score < 50% of mean).
 *         - Underperformers fall back to the next-best genre from the ranked list.
 *      c. Build a suggestion with a reason string explaining why.
 *   5. Return up to `count` suggestions (default 7).
 *
 * When there is no analytics data the planner falls back to the pure day-of-week
 * schedule — it always produces suggestions even with an empty dataset.
 */

import { analyticsService } from "./analytics.service";
import { queueService } from "./queue.service";
import { settingsService } from "./settings.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlannerSuggestion {
  genre: string;
  scheduledFor: string;  // ISO datetime — always 09:00 local UTC
  reason: string;        // plain-English explanation for the UI
  score: number;         // avg analytics score for this genre (0 if no data)
  dayLabel: string;      // "Monday", "Tuesday", etc.
  isOverride: boolean;   // true when the suggested genre differs from the schedule default
  defaultGenre: string;  // what the schedule would have suggested for this day
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Format a Date as a YYYY-MM-DD string in local time */
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Build the ISO datetime for 09:00 on a given date (local time, converted to UTC) */
function scheduledAtNineAM(d: Date): string {
  const copy = new Date(d);
  copy.setHours(9, 0, 0, 0);
  return copy.toISOString();
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function suggestQueueItems(count = 7): Promise<PlannerSuggestion[]> {
  // ── 1. Analytics: compute per-genre avg score ──────────────────────────────

  const records = await analyticsService.getAll();

  const genreScores = new Map<string, number>(); // genre → avg score
  if (records.length > 0) {
    const genreMap = new Map<string, number[]>();
    for (const r of records) {
      const list = genreMap.get(r.genre) ?? [];
      list.push(r.score);
      genreMap.set(r.genre, list);
    }
    for (const [genre, scores] of genreMap) {
      genreScores.set(genre, Math.round(avg(scores)));
    }
  }

  const globalMean = genreScores.size > 0
    ? avg([...genreScores.values()])
    : 0;

  // Rank all genres that have data: best → worst
  const rankedGenres = [...genreScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  // ── 2. Existing queue: which days already have a pending/queued item? ───────

  const existingItems = await queueService.list();
  const occupiedDates = new Set<string>();
  for (const item of existingItems) {
    if (item.status === "pending" || item.status === "queued" || item.status === "generating") {
      occupiedDates.add(toDateString(new Date(item.scheduledFor)));
    }
  }

  // ── 3. Settings: day-of-week genre schedule ──────────────────────────────

  const settings = await settingsService.read();
  // genreSchedule keys are "0" (Sun) → "6" (Sat)
  const scheduleMap: Record<number, string> = {};
  for (const [key, genre] of Object.entries(settings.genreSchedule)) {
    scheduleMap[parseInt(key)] = genre.toLowerCase();
  }

  // All 7 genre names in schedule order, used as fallback pool
  const allScheduledGenres = Object.values(scheduleMap);
  const allKnownGenres = [...new Set([...allScheduledGenres, ...rankedGenres])];

  // ── 4. Build suggestions for the next N available days ───────────────────

  const suggestions: PlannerSuggestion[] = [];
  let daysAhead = 1; // start tomorrow

  while (suggestions.length < count && daysAhead <= count * 3) {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    const dateStr = toDateString(date);
    const dayIndex = date.getDay(); // 0=Sun, 6=Sat
    const dayLabel = DAY_NAMES[dayIndex];

    daysAhead++;

    // Skip if this day already has a pending item
    if (occupiedDates.has(dateStr)) continue;

    const defaultGenre = scheduleMap[dayIndex] ?? allScheduledGenres[dayIndex % allScheduledGenres.length] ?? "horror";
    const defaultScore = genreScores.get(defaultGenre) ?? 0;

    // Decide the best genre for this slot
    let chosenGenre = defaultGenre;
    let isOverride = false;
    let reason: string;

    if (globalMean > 0 && genreScores.size >= 2) {
      // Check if the scheduled genre is an underperformer
      const isUnderperformer = defaultScore > 0 && defaultScore < globalMean * 0.5;

      if (isUnderperformer && rankedGenres.length > 0) {
        // Substitute: pick the best-performing genre not already heavily scheduled
        // Count how many times each genre appears in our current suggestions
        const suggestionCounts = new Map<string, number>();
        for (const s of suggestions) {
          suggestionCounts.set(s.genre, (suggestionCounts.get(s.genre) ?? 0) + 1);
        }

        // Find the best genre that isn't over-represented (max 2 per 7 suggestions)
        const substitute = rankedGenres.find(
          (g) => g !== defaultGenre && (suggestionCounts.get(g) ?? 0) < 2
        );

        if (substitute) {
          chosenGenre = substitute;
          isOverride = true;
          const substituteScore = genreScores.get(substitute) ?? 0;
          reason = `${capitalize(defaultGenre)} underperforms (avg ${defaultScore.toLocaleString()} vs channel mean ${Math.round(globalMean).toLocaleString()}). Substituted with ${capitalize(substitute)} (avg ${substituteScore.toLocaleString()}).`;
        } else {
          reason = `${capitalize(defaultGenre)} is scheduled for ${dayLabel}. (Underperforms but no better substitute available.)`;
        }
      } else if (defaultScore > 0 && defaultScore > globalMean * 1.2) {
        // Scheduled genre is a strong performer — reinforce it
        reason = `${capitalize(defaultGenre)} is scheduled for ${dayLabel} and is performing above average (avg ${defaultScore.toLocaleString()} vs mean ${Math.round(globalMean).toLocaleString()}).`;
      } else if (defaultScore === 0) {
        // No data for this genre yet
        reason = `${capitalize(defaultGenre)} is scheduled for ${dayLabel}. No performance data yet — this will build your dataset.`;
      } else {
        // Average performer — follow the schedule
        reason = `${capitalize(defaultGenre)} is scheduled for ${dayLabel} (avg ${defaultScore.toLocaleString()}).`;
      }
    } else {
      // No analytics data — pure schedule fallback
      reason = `${capitalize(defaultGenre)} is scheduled for ${dayLabel}. (No analytics data yet — following the genre schedule.)`;
    }

    suggestions.push({
      genre: chosenGenre,
      scheduledFor: scheduledAtNineAM(date),
      reason,
      score: genreScores.get(chosenGenre) ?? 0,
      dayLabel,
      isOverride,
      defaultGenre,
    });
  }

  return suggestions;
}

/**
 * Accept a list of planner suggestions and create them as queue items.
 * Each accepted suggestion becomes one QueueItem with status "pending".
 * Returns the created items.
 */
export async function acceptSuggestions(
  suggestions: PlannerSuggestion[],
): Promise<Awaited<ReturnType<typeof queueService.create>>[]> {
  const created = [];
  for (const s of suggestions) {
    const item = await queueService.create(
      s.genre,
      s.scheduledFor,
      s.reason,  // store the reason as the queue item's notes
    );
    created.push(item);
  }
  return created;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const plannerService = { suggestQueueItems, acceptSuggestions };
