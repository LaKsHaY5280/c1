import { Router, type Request, type Response } from "express";
import { logService } from "../services/log.service";

const router = Router();

// GET /logs/:runId — return all log events for a run as JSON array
// The client can poll this while status is "running" to show live progress
router.get("/:runId", async (req: Request, res: Response) => {
  const events = await logService.read(String(req.params.runId));
  res.json(events);
});

export default router;
