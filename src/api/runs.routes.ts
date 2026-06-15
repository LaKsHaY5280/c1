import { Router, type Request, type Response } from "express";
import { runService } from "../services/run.service";

const router = Router();

// GET /runs — list all runs, newest first
router.get("/", async (_req: Request, res: Response) => {
  const runs = await runService.list();
  res.json(runs);
});

// GET /runs/:id — one run with full step statuses and history
router.get("/:id", async (req: Request, res: Response) => {
  const run = await runService.load(String(req.params.id));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

export default router;
