import { Router, type Request, type Response } from "express";
import { plannerService, type PlannerSuggestion } from "../services/planner.service";

const router = Router();

// ─── GET /planner/suggest ─────────────────────────────────────────────────────
// Returns up to `count` suggested queue items based on analytics + schedule.
// Query params: ?count=7  (default 7, max 14)
router.get("/suggest", async (req: Request, res: Response) => {
  const raw   = parseInt(String(req.query.count ?? "7"), 10);
  const count = isNaN(raw) ? 7 : Math.min(Math.max(1, raw), 14);
  const suggestions = await plannerService.suggestQueueItems(count);
  res.json(suggestions);
});

// ─── POST /planner/accept ─────────────────────────────────────────────────────
// Body: { suggestions: PlannerSuggestion[] }
// Accepts a subset of suggestions and creates them as queue items.
// Returns the created QueueItem records.
router.post("/accept", async (req: Request, res: Response) => {
  const { suggestions } = req.body as { suggestions: PlannerSuggestion[] };

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    res.status(400).json({ error: "suggestions must be a non-empty array" });
    return;
  }

  const created = await plannerService.acceptSuggestions(suggestions);
  res.status(201).json({ created: created.length, items: created });
});

export default router;
