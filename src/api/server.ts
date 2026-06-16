import express from "express";
import cors from "cors";
import path from "path";
import runsRouter from "./runs.routes";
import pipelineRouter from "./pipeline.routes";
import assetsRouter from "./assets.routes";
import logsRouter from "./logs.routes";
import queueRouter from "./queue.routes";
import schedulerRouter from "./scheduler.routes";
import { schedulerService } from "../services/scheduler.service";
import { settingsService } from "../services/settings.service";

const PORT = 3001;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static video serving — GET /videos/VID-HOR-20260615-001.mp4
app.use("/videos", express.static(path.join(process.cwd(), "output", "videos")));

// Static thumbnail serving — GET /thumbnails/THM-HOR-20260615-001.jpg
app.use("/thumbnails", express.static(path.join(process.cwd(), "output", "thumbnails")));

// Routes
app.use("/runs",      runsRouter);
app.use("/pipeline",  pipelineRouter);
app.use("/assets",    assetsRouter);
app.use("/logs",      logsRouter);
app.use("/queue",     queueRouter);
app.use("/scheduler", schedulerRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🌐 API server running at http://localhost:${PORT}`);
  console.log(`   GET  /runs | GET /runs/:id`);
  console.log(`   POST /pipeline/start | /step/:step | /cancel/:runId`);
  console.log(`   GET  /assets/* (10 collections + raw files + thumbnails)`);
  console.log(`   GET|PUT /assets/settings`);
  console.log(`   GET  /videos/:filename  (static MP4)`);
  console.log(`   GET  /thumbnails/:filename  (static JPG)`);
  console.log(`   GET  /logs/:runId`);
  console.log(`   GET  /queue | POST /queue | PUT /queue/:id | DELETE /queue/:id`);
  console.log(`   POST /queue/:id/trigger`);
  console.log(`   GET  /scheduler/status | POST /scheduler/tick`);
  console.log(`   GET  /health`);

  // Start the scheduler only if enabled in settings (default: true)
  settingsService.read().then((settings) => {
    if (settings.schedulerEnabled) {
      schedulerService.start();
    } else {
      console.log("⏰ Scheduler disabled in settings — start manually via POST /scheduler/tick");
    }
  }).catch(() => schedulerService.start()); // fall back to starting if settings unreadable
});

export default app;
