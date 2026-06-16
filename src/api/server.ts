import express from "express";
import cors from "cors";
import path from "path";
import runsRouter from "./runs.routes";
import pipelineRouter from "./pipeline.routes";
import assetsRouter from "./assets.routes";
import logsRouter from "./logs.routes";
import queueRouter from "./queue.routes";
import schedulerRouter from "./scheduler.routes";
import analyticsRouter from "./analytics.routes";
import feedbackRouter from "./feedback.routes";
import plannerRouter from "./planner.routes";
import { schedulerService } from "../services/scheduler.service";
import { settingsService } from "../services/settings.service";

const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Static file serving
app.use("/videos",     express.static(path.join(process.cwd(), "output", "videos")));
app.use("/thumbnails", express.static(path.join(process.cwd(), "output", "thumbnails")));

// Routes
app.use("/runs",      runsRouter);
app.use("/pipeline",  pipelineRouter);
app.use("/assets",    assetsRouter);
app.use("/logs",      logsRouter);
app.use("/queue",     queueRouter);
app.use("/scheduler", schedulerRouter);
app.use("/analytics", analyticsRouter);
app.use("/feedback",  feedbackRouter);
app.use("/planner",  plannerRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🌐 API server running at http://localhost:${PORT}`);
  console.log(`   GET  /runs | GET /runs/:id`);
  console.log(`   POST /pipeline/start | /step/:step | /cancel/:runId`);
  console.log(`   GET  /assets/*  GET|PUT /assets/settings`);
  console.log(`   GET  /videos/:filename | /thumbnails/:filename`);
  console.log(`   GET  /logs/:runId`);
  console.log(`   GET  /queue | POST /queue | PUT|DELETE /queue/:id | POST /queue/:id/trigger`);
  console.log(`   GET  /scheduler/status | POST /scheduler/tick | POST /scheduler/next`);
  console.log(`   GET  /analytics | GET /analytics/genres | POST /analytics/refresh`);
  console.log(`   GET  /feedback  | POST /feedback/recompute`);
  console.log(`   GET  /planner/suggest | POST /planner/accept`);
  console.log(`   GET  /health`);

  settingsService.read()
    .then((s) => {
      if (s.schedulerEnabled) schedulerService.start();
      else console.log("⏰ Scheduler disabled in settings — use POST /scheduler/tick to trigger manually");
    })
    .catch(() => schedulerService.start());
});

export default app;
