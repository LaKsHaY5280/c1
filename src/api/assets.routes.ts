import { Router, type Request, type Response } from "express";
import { assetService } from "../services/asset.service";
import { settingsService } from "../services/settings.service";

const router = Router();

// ─── Raw asset files (jpg/mp4) in data/assets/ ───────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const files = await assetService.listAssetFiles();
  res.json(files);
});

// ─── Story collections ────────────────────────────────────────────────────────
router.get("/ideas", async (_req: Request, res: Response) => {
  res.json(await assetService.listIdeas());
});

router.get("/scripts", async (_req: Request, res: Response) => {
  res.json(await assetService.listScripts());
});

router.get("/characters", async (_req: Request, res: Response) => {
  res.json(await assetService.listCharacters());
});

router.get("/scenes", async (_req: Request, res: Response) => {
  res.json(await assetService.listScenes());
});

// ─── Media collections ────────────────────────────────────────────────────────
router.get("/audio", async (_req: Request, res: Response) => {
  res.json(await assetService.listAudio());
});

router.get("/captions", async (_req: Request, res: Response) => {
  res.json(await assetService.listCaptions());
});

router.get("/videos", async (_req: Request, res: Response) => {
  res.json(await assetService.listVideos());
});

router.get("/uploads", async (_req: Request, res: Response) => {
  res.json(await assetService.listUploads());
});

router.get("/metadata", async (_req: Request, res: Response) => {
  res.json(await assetService.listMetadata());
});

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get("/settings", async (_req: Request, res: Response) => {
  res.json(await settingsService.read());
});

router.put("/settings", async (req: Request, res: Response) => {
  const updated = await settingsService.update(req.body);
  res.json(updated);
});

export default router;
