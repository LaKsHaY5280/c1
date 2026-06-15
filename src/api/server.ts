import express from "express";
import cors from "cors";
import runsRouter from "./runs.routes";
import pipelineRouter from "./pipeline.routes";
import assetsRouter from "./assets.routes";
import logsRouter from "./logs.routes";

const PORT = 3001;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/runs",     runsRouter);
app.use("/pipeline", pipelineRouter);
app.use("/assets",   assetsRouter);   // GET /assets
app.use("/",         assetsRouter);   // GET /ideas, /videos, /uploads, GET|PUT /settings
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
  console.log(`   GET  /assets`);
  console.log(`   GET  /ideas`);
  console.log(`   GET  /videos`);
  console.log(`   GET  /uploads`);
  console.log(`   GET  /settings`);
  console.log(`   PUT  /settings`);
  console.log(`   GET  /logs/:runId`);
  console.log(`   GET  /health`);
});

export default app;
