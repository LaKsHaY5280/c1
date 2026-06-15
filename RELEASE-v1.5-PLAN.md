# v1.5 Plan — Dashboard-Ready Backend

**Status:** Design only. v1 is complete and unchanged.
**Goal:** Wrap the existing 13-step pipeline in a control layer that a dashboard can talk to.
**Rule:** Do not touch any existing module in `src/modules/`. They already work.

---

## The Problem with v1 Architecture

v1 runs as:

```
index.ts → run all 13 steps sequentially → exit
```

A dashboard needs:

```
UI → start a run → watch step-by-step progress → inspect outputs → retry a failed step
```

The fix is not to rewrite the engine. It is to add a thin control layer around it.

```
modules/  = engine       (untouched)
pipeline/ = orchestration (new)
api/      = bridge to UI  (new)
services/ = shared logic  (new)
```

---

## Mental Model

| Layer | Responsibility | Status |
|-------|---------------|--------|
| `src/modules/` | Core generation — idea, script, voice, render, upload | ✅ v1 complete |
| `src/pipeline/` | Run lifecycle, step execution, context passing | 🔲 v1.5 |
| `src/services/` | Run records, logs, asset lists, settings | 🔲 v1.5 |
| `src/api/` | Express routes the dashboard calls | 🔲 v1.5 |
| `dashboard/` | Vite frontend | 🔲 v2 |

---

## Build Order

Order matters. The UI becomes easy only after the backend can describe itself.

```
1. Run model (RUN-* records)
2. Step status tracking
3. Structured logger
4. runPipeline() + runStep()
5. Express API routes
6. Settings file
7. Vite dashboard
8. Rerun / resume support
```

---

## Phase 1 — Run Model

### The missing concept

Every asset currently exists (`IDEA-*`, `VID-*`, `UPL-*`) but there is no object representing
one execution of the whole pipeline. The dashboard needs this to answer:
- What is running right now?
- What ran yesterday?
- Where did last night's run fail?

### New file

**`src/pipeline/pipeline-context.ts`**

```typescript
export type RunStatus = "pending" | "running" | "completed" | "failed";
export type StepName =
  | "idea" | "script" | "characters" | "scenes"
  | "visualSearch" | "pexels" | "manifest"
  | "voice" | "captions" | "render" | "metadata" | "upload";

export interface StepRecord {
  step: StepName;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  outputId?: string;   // e.g. "IDEA-HOR-20260615-001"
  error?: string;
}

export interface RunRecord {
  id: string;          // RUN-20260615-001
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  currentStep?: StepName;
  // Map for current state — O(1) lookup by step name
  steps: Record<StepName, StepRecord>;
  // Append-only event history — supports reruns and "what happened over time"
  history: StepEvent[];
  error?: string;
}

// Separate event type for the append-only history log
export interface StepEvent {
  step: StepName;
  event: "started" | "completed" | "failed";
  timestamp: string;
  outputId?: string;
  error?: string;
}
```

**Why both `steps` and `history`:**
- `steps` is a map — perfect for current state display (one row per step)
- `history` is an append-only array — supports reruns, retries, and "what changed over time"
- The dashboard uses `steps` to show a progress table and `history` to show a timeline

### Storage

```
data/runs/
  RUN-20260615-001.json
  RUN-20260616-001.json
```

### Example record

```json
{
  "id": "RUN-20260615-001",
  "status": "running",
  "startedAt": "2026-06-15T10:00:00Z",
  "currentStep": "voice",
  "steps": {
    "idea":        { "status": "completed", "outputId": "IDEA-HOR-20260615-001" },
    "script":      { "status": "completed", "outputId": "SCR-HOR-20260615-001" },
    "characters":  { "status": "completed", "outputId": "CHAR-HOR-20260615-001" },
    "scenes":      { "status": "completed", "outputId": "SCN-HOR-20260615-001" },
    "visualSearch":{ "status": "completed" },
    "pexels":      { "status": "completed" },
    "manifest":    { "status": "completed" },
    "voice":       { "status": "running" },
    "captions":    { "status": "pending" },
    "render":      { "status": "pending" },
    "metadata":    { "status": "pending" },
    "upload":      { "status": "pending" }
  },
  "history": [
    { "step": "idea",    "event": "started",   "timestamp": "..." },
    { "step": "idea",    "event": "completed", "timestamp": "...", "outputId": "IDEA-HOR-20260615-001" },
    { "step": "script",  "event": "started",   "timestamp": "..." },
    { "step": "script",  "event": "completed", "timestamp": "...", "outputId": "SCR-HOR-20260615-001" },
    { "step": "voice",   "event": "started",   "timestamp": "..." }
  ]
}
```

---

## Phase 2 — Step Status Tracking

Each step wrapper should record:
- `startedAt` before calling the module
- `finishedAt` + `outputId` on success
- `finishedAt` + `error` on failure

The existing modules stay unchanged. The wrapper lives in `run-step.ts`.

**`src/pipeline/run-step.ts`**

```typescript
async function runStep(
  stepName: StepName,
  run: RunRecord,
  fn: () => Promise<string | undefined>  // returns outputId if applicable
): Promise<void>
```

- Marks step `running`, calls `fn()`, marks `completed` or `failed`
- Writes updated `RunRecord` to `data/runs/` after each step
- Dashboard polls `GET /runs/:id` to get live progress

---

## Phase 3 — Structured Logger

Replace all `console.log()` with a logger that writes structured events.

**`src/services/log.service.ts`**

```typescript
interface LogEvent {
  runId: string;
  step?: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}
```

### Append-only storage

Logs are written as **append-only** — one event appended to the file per write.
This means the dashboard can safely stream logs without the server rewriting the whole
file on every event. It also survives retries cleanly: if a step is retried, new events
simply append to the existing log rather than overwriting.

```
data/logs/
  RUN-20260615-001.log.json    ← array of LogEvent, appended one line at a time
```

Implementation: `appendFile()` with a newline-delimited JSON (NDJSON) format,
or a simple array in a JSON file where each write appends to the array.
NDJSON is preferred for streaming — each line is a complete JSON object.

Also prints to terminal — same output as today, just also persisted.

Dashboard use: `GET /logs/:runId` → streams or returns the event array.

---

## Phase 4 — Pipeline Orchestration

### Step registry

Add an explicit registry that maps step names to functions **before** writing `runPipeline()`.
This is what keeps the API and dashboard clean — they pass a step name string,
the registry resolves it to the right function, no module knowledge required.

**`src/pipeline/step-registry.ts`**

```typescript
// Maps StepName → async function that runs that step
// runPipeline() iterates this in order
// runStep(name, context) looks up by name for retry/manual trigger
export const STEP_REGISTRY: Record<StepName, StepFn> = {
  idea:         (ctx) => runIdeaStep(ctx),
  script:       (ctx) => runScriptStep(ctx),
  characters:   (ctx) => runCharactersStep(ctx),
  scenes:       (ctx) => runScenesStep(ctx),
  visualSearch: (ctx) => runVisualSearchStep(ctx),
  pexels:       (ctx) => runPexelsStep(ctx),
  manifest:     (ctx) => runManifestStep(ctx),
  voice:        (ctx) => runVoiceStep(ctx),
  captions:     (ctx) => runCaptionsStep(ctx),
  render:       (ctx) => runRenderStep(ctx),
  metadata:     (ctx) => runMetadataStep(ctx),
  upload:       (ctx) => runUploadStep(ctx),
};
```

This registry is the only place that knows which module maps to which step name.
`runPipeline()` iterates it in order. `runStep("voice", context)` looks it up by key.
Adding a new step in the future means one entry here — nothing else changes.

### Pipeline runner

**`src/pipeline/run-pipeline.ts`**

Replaces `src/index.ts` as the orchestration layer.
`index.ts` becomes a thin entry point:

```typescript
// index.ts (after refactor)
import { runPipeline } from "./pipeline/run-pipeline";
runPipeline().catch(console.error);
```

`runPipeline()` creates a `RunRecord`, iterates `STEP_REGISTRY` in order using
`runStep()`, and handles top-level errors with a final status update.

**`src/pipeline/run-step.ts`**

Also exposes `runStep(stepName, context)` for the API to call individual steps.
This is what powers "Retry" buttons in the dashboard.

- Marks step `running` in `steps` map, appends `started` event to `history`
- Calls the module function via the registry
- On success: marks `completed`, appends `completed` event with `outputId`
- On failure: marks `failed`, appends `failed` event with error message
- Writes updated `RunRecord` to disk after every state change

### Delay rerun/resume logic

Resume-from-checkpoint (skipping already-completed steps) should wait until step
tracking is stable and proven. Add it after the API is working, not before.

---

## Phase 5 — Express API

### Process architecture decision

**Two processes, one machine:**
- `npm start` → runs the CLI pipeline as before (no server)
- `npm run server` → starts Express API on port `3001`
- `npm run dashboard` → starts Vite dev server on port `5173` (proxies API calls to `3001`)

This avoids the pipeline blocking the API during a long render step, and keeps the
CLI path working without any server dependency. The dashboard is optional — you can
always run `npm start` directly.

**`src/api/`**

Install: `npm install express cors`
Install types: `npm install --save-dev @types/express @types/cors`

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs` | List all run records |
| `GET` | `/runs/:id` | Get one run with full step statuses and history |
| `POST` | `/pipeline/start` | Start a new full pipeline run |
| `POST` | `/pipeline/step/:step` | Run one step (for retry/manual trigger) |
| `GET` | `/assets` | List all generated assets |
| `GET` | `/ideas` | List all idea files |
| `GET` | `/videos` | List all video files |
| `GET` | `/uploads` | List all upload records |
| `GET` | `/logs/:runId` | Stream or return NDJSON log events for a run |
| `GET` | `/settings` | Read current settings |
| `PUT` | `/settings` | Update settings |

### File layout

```
src/api/
├── server.ts           Express app setup, middleware, port 3001
├── runs.routes.ts
├── pipeline.routes.ts
├── assets.routes.ts
└── logs.routes.ts
```

UI never imports from `modules/` directly. All calls go through the API.

---

## Phase 6 — Settings File

Move hardcoded values out of modules into a config file the UI can edit.

**`data/config/settings.json`** (default, gitignored)
**`src/services/settings.service.ts`** (reads/writes it)

```json
{
  "defaultVisibility": "private",
  "ttsVoice": "Kore",
  "captionMaxWordsPerSegment": 8,
  "genreSchedule": {
    "0": "drama",
    "1": "horror",
    "2": "mystery",
    "3": "scifi",
    "4": "fantasy",
    "5": "thriller",
    "6": "romance"
  },
  "autoPublish": false
}
```

---

## Phase 7 — Service Layer

Thin wrappers that the API routes call. They call modules internally.

```
src/services/
├── run.service.ts       CRUD for RunRecord — create, update step, mark complete/failed
├── asset.service.ts     List ideas, scripts, videos, uploads from data/
├── log.service.ts       Write and read structured log events
└── settings.service.ts  Read/write data/config/settings.json
```

---

## Phase 8 — Vite Dashboard (v2)

After all phases above are done, the dashboard is mostly UI work.

```
dashboard/
├── src/
│   ├── pages/
│   │   ├── RunsPage.tsx       list of runs with status
│   │   ├── RunDetailPage.tsx  step-by-step progress for one run
│   │   ├── AssetsPage.tsx     browse ideas, videos, uploads
│   │   └── SettingsPage.tsx   edit settings.json from the browser
│   ├── components/
│   │   ├── StepBadge.tsx      pending / running / completed / failed
│   │   ├── LogViewer.tsx      live log stream
│   │   └── VideoPlayer.tsx    preview output/videos/VID-*.mp4
│   ├── hooks/
│   │   ├── useRun.ts          polls GET /runs/:id every 2s while running
│   │   └── useSettings.ts
│   └── api/
│       └── client.ts          typed wrappers for all API routes
```

---

## New Data Layout (v1.5)

```
data/
  runs/           RUN-*.json           (run records with step statuses)
  logs/           RUN-*.log.json       (structured log events per run)
  config/
    settings.json                      (user-editable pipeline settings)
  story/          ...unchanged
  media/          ...unchanged
  assets/         ...unchanged
  tmp/            ...unchanged

output/
  videos/         ...unchanged
```

---

## What Does Not Change

These modules are the core engine. They are not touched in v1.5:

```
src/modules/story/idea.ts
src/modules/story/script.ts
src/modules/story/character.ts
src/modules/story/scene.ts
src/modules/media/visual-search.ts
src/modules/media/pexels.ts
src/modules/media/downloader.ts
src/modules/media/voice.ts
src/modules/media/caption.ts
src/modules/media/renderer.ts
src/modules/media/metadata.ts
src/modules/youtube/uploader.ts
src/modules/youtube/youtube.ts
```

`index.ts` becomes a thin entry point that calls `runPipeline()`.
`runPipeline()` calls the modules exactly as `index.ts` does today.

---

## Summary

| Phase | What | New Files |
|-------|------|-----------|
| 1 | Run model | `pipeline/pipeline-context.ts` |
| 2 | Step tracking | `pipeline/run-step.ts` |
| 3 | Structured logger | `services/log.service.ts` |
| 4 | Step registry + pipeline runner | `pipeline/step-registry.ts`, `pipeline/run-pipeline.ts` |
| 5 | Express API | `api/server.ts` + route files |
| 6 | Settings file | `services/settings.service.ts` + `data/config/settings.json` |
| 7 | Service layer | `services/run.service.ts`, `asset.service.ts` |
| 8 | Vite dashboard | `dashboard/` (separate project) |
