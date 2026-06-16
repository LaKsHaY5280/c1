import express from "express";
import cors from "cors";
import path from "path";
import runsRouter from "./runs.routes";
import pipelineRouter from "./pipeline.routes";
import assetsRouter from "./assets.routes";
import logsRouter from "./logs.routes";

const PORT = 3001;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static video serving — GET /videos/VID-HOR-20260615-001.mp4
app.use("/videos", express.static(path.join(process.cwd(), "output", "videos")));

// Routes
app.use("/runs",     runsRouter);
app.use("/pipeline", pipelineRouter);
app.use("/assets",   assetsRouter);   // GET /assets         → raw file list
                                      // GET /assets/ideas   /scripts /characters /scenes
                                      // GET /assets/audio   /captions /videos /uploads /metadata
                                      // GET|PUT /assets/settings

app.use("/logs",     logsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🌐 API server running at http://localhost:${PORT}`);
  console.log(`   GET  /runs`);
  console.log(`   GET  /runs/:id`);
  console.log(`   POST /pipeline/start`);
  console.log(`   POST /pipeline/step/:step`);
  console.log(`   POST /pipeline/cancel/:runId`);
  console.log(`   GET  /assets               (raw file list)`);
  console.log(`   GET  /assets/ideas | /assets/scripts | /assets/characters | /assets/scenes`);
  console.log(`   GET  /assets/audio | /assets/captions | /assets/videos | /assets/uploads | /assets/metadata`);
  console.log(`   GET|PUT /assets/settings`);
  console.log(`   GET  /videos/:filename      (static MP4 serving)`);
  console.log(`   GET  /logs/:runId`);
  console.log(`   GET  /health`);
});

export default app;
