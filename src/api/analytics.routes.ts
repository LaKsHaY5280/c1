import { Router, type Request, type Response } from "express";
import { analyticsService } from "../services/analytics.service";

const router = Router();

// ─── GET /analytics ───────────────────────────────────────────────────────────
// All records sorted by score (best first).
// Query params: ?genre=horror  to filter by genre
router.get("/", async (req: Request, res: Response) => {
  const records = await analyticsService.getAll();
  const genre = req.query.genre as string | undefined;
  res.json(genre ? records.filter((r) => r.genre === genre) : records);
});

// ─── GET /analytics/genres ────────────────────────────────────────────────────
// Per-genre averages — views, likes, comments, score
router.get("/genres", async (_req: Request, res: Response) => {
  res.json(await analyticsService.getGenreAverages());
});

// ─── GET /analytics/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const record = await analyticsService.getById(String(req.params.id));
  if (!record) {
    res.status(404).json({ error: `Analytics record not found: ${req.params.id}` });
    return;
  }
  res.json(record);
});

// ─── POST /analytics/refresh ─────────────────────────────────────────────────
// Pull fresh stats from YouTube for all stored records.
// This is the main data ingestion endpoint — call it on a schedule or manually.
router.post("/refresh", async (_req: Request, res: Response) => {
  console.log("[analytics] Refreshing all records from YouTube...");
  const result = await analyticsService.refreshAll();
  res.json({ message: "Refresh complete", ...result });
});

// ─── POST /analytics/refresh/:id ─────────────────────────────────────────────
// Refresh one record by analytics ID.
router.post("/refresh/:id", async (req: Request, res: Response) => {
  const record = await analyticsService.getById(String(req.params.id));
  if (!record) {
    res.status(404).json({ error: `Analytics record not found: ${req.params.id}` });
    return;
  }
  const updated = await analyticsService.refreshRecord(record);
  res.json(updated);
});

export default router;
