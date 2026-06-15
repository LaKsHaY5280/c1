import { Router, type Request, type Response } from "express";
import { assetService } from "../services/asset.service";
import { settingsService } from "../services/settings.service";

const router = Router();

// GET /assets — list raw asset files (jpg/mp4) in data/assets/
router.get("/", async (_req: Request, res: Response) => {
  const files = await assetService.listAssetFiles();
  res.json(files);
});

// GET /ideas
router.get("/ideas", async (_req: Request, res: Response) => {
  const ideas = await assetService.listIdeas();
  res.json(ideas);
});

// GET /videos
router.get("/videos", async (_req: Request, res: Response) => {
  const videos = await assetService.listVideos();
  res.json(videos);
});

// GET /uploads
router.get("/uploads", async (_req: Request, res: Response) => {
  const uploads = await assetService.listUploads();
  res.json(uploads);
});

// GET /settings
router.get("/settings", async (_req: Request, res: Response) => {
  const settings = await settingsService.read();
  res.json(settings);
});

// PUT /settings — merge partial update into existing settings
router.put("/settings", async (req: Request, res: Response) => {
  const updated = await settingsService.update(req.body);
  res.json(updated);
});

export default router;
