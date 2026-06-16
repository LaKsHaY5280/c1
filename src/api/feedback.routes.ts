import { Router, type Request, type Response } from "express";
import { feedbackService } from "../services/feedback.service";

const router = Router();

// ─── GET /feedback ────────────────────────────────────────────────────────────
// Compute and return a fresh feedback report from the current analytics data.
// No storage — every call re-derives recommendations from live records.
router.get("/", async (_req: Request, res: Response) => {
  const report = await feedbackService.computeFeedback();
  res.json(report);
});

// ─── POST /feedback/recompute ─────────────────────────────────────────────────
// Explicit recompute alias — same as GET but useful for mutation-style calls
// from the dashboard (e.g. after a YouTube refresh).
router.post("/recompute", async (_req: Request, res: Response) => {
  const report = await feedbackService.computeFeedback();
  res.json(report);
});

export default router;
