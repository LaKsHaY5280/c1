# Release v1.5 — Dashboard-Ready Backend

**Date:** 2026-06-15
**Status:** Complete. All phases 1–7 implemented. Phase 8 (Vite dashboard) is v2.
**Built on top of:** v1 — all 13 pipeline steps untouched.

---

## What Changed From v1

v1 was a CLI script:
```
npm start → runs 13 steps → exits
```

v1.5 adds a control layer around the same engine:
```
npm start          → CLI pipeline (unchanged)
npm run server     → Express API on port 3001
```

The core modules (`src/modules/`) are completely unchanged.
The new layers wrap them without touching a single line of generation logic.

---

## New Architecture

```
src/modules/    engine        (v1 — untouched)
src/pipeline/   orchestration (v1.5 — new)
src/services/   shared logic  (v1.5 — new)
src/api/        HTTP bridge   (v1.5 — new)
```

---

## What Was Built

### Phase 1 — Run Model

Every pipeline execution now creates a persisted `RunRecord`.

**`src/pipeline/pipeline-context.ts`**

Defines `RunRecord`, `StepRecord`, `StepEvent`, `RunStatus`, `StepName`, `STEP_ORDER`.

Key design: two structures for tracking state:
- `steps` — map of current status per step (O(1) lookup, one row per step in the dashboard)
- `history` — append-only event array (survives retries, supports timeline view)

Storage: `data/runs/RUN-YYYYMMDD-NNN.json`

---

### Phase 2 — Step Status Tracking

**`src/pipeline/run-step.ts`**

Thin wrapper around each step function:
- Marks step `running` + appends `started` event before calling
- On success: marks `completed` + appends `completed` event with `outputId`
- On failure: marks `failed` + appends `failed` event with error message
- Persists `RunRecord` to disk after every state change

---

### Phase 3 — Structured Logger

**`src/services/log.service.ts`**

Replaces bare `console.log()` throughout the pipeline with structured events:
```typescript
{ runId, step?, level, message, timestamp }
```

- Writes **append-only NDJSON** — one JSON object per line per `appendFileSync`
- Safe for streaming — no file rewrite on each event
- Also prints to terminal — developer experience unchanged
- Storage: `data/logs/RUN-*.log.ndjson`

---

### Phase 4 — Step Registry + Pipeline Runner

**`src/pipeline/step-registry.ts`**

The only file that maps step names to module functions. `STEP_REGISTRY` is a `Record<StepName, StepFn>`. Adding a new step in the future = one entry here.

Carries state between steps via `PipelineContext` — a shared object built up as the pipeline runs.

**`src/pipeline/run-pipeline.ts`**

Creates a `RunRecord`, iterates `STEP_ORDER`, calls `runStep()` for each entry in `STEP_REGISTRY`, marks run `completed` or `failed` at the end.

**`src/index.ts`** (updated — was 150+ lines, now 4)

```typescript
import { runPipeline } from "./pipeline/run-pipeline";
runPipeline().catch((err) => { console.error(err); process.exit(1); });
```

---

### Phase 5 — Express API

**`src/api/server.ts`** — Express on port 3001

All API routes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs` | List all runs, newest first |
| `GET` | `/runs/:id` | Full run record with steps + history |
| `POST` | `/pipeline/start` | Start full pipeline run (async, returns `runId` immediately) |
| `POST` | `/pipeline/step/:step` | Run one step — body: `{ runId }` |
| `GET` | `/assets` | List asset files in `data/assets/` |
| `GET` | `/ideas` | List all idea JSON files |
| `GET` | `/videos` | List all video JSON files |
| `GET` | `/uploads` | List all upload records |
| `GET` | `/settings` | Read current settings |
| `PUT` | `/settings` | Update settings (partial merge) |
| `GET` | `/logs/:runId` | All log events for a run |
| `GET` | `/health` | Server health check |

Route files: `runs.routes.ts`, `pipeline.routes.ts`, `assets.routes.ts`, `logs.routes.ts`

---

### Phase 6 — Settings File

**`src/services/settings.service.ts`** + **`data/config/settings.json`**

Moves hardcoded values out of modules into an editable config:

```json
{
  "defaultVisibility": "private",
  "ttsVoice": "Kore",
  "captionMaxWordsPerSegment": 8,
  "genreSchedule": { "0": "drama", "1": "horror", ... },
  "autoPublish": false
}
```

`settingsService.read()` merges file with defaults — safe if file is missing.
`PUT /settings` writes partial updates via the API.

---

### Phase 7 — Service Layer

| File | Purpose |
|------|---------|
| `src/services/run.service.ts` | CRUD for `RunRecord` — create, load, list, all state transitions |
| `src/services/log.service.ts` | Logger factory + log file reader |
| `src/services/asset.service.ts` | List wrappers for ideas, scripts, videos, uploads, raw assets |
| `src/services/settings.service.ts` | Read/write typed settings with defaults |

---

## New Data Layout

```
data/
  runs/           RUN-*.json           (run records — created per pipeline execution)
  logs/           RUN-*.log.ndjson     (structured log events per run, append-only)
  config/
    settings.json                      (editable pipeline settings)
  story/          ...unchanged
  media/          ...unchanged
  assets/         ...unchanged
  tmp/            ...unchanged

output/
  videos/         ...unchanged
```

---

## Scripts

```bash
npm start           # CLI — full 13-step pipeline run, no server needed
npm run dev         # CLI with auto-restart on file changes
npm run server      # Start API on port 3001
npm run server:dev  # API with auto-restart on file changes
```

---

## How to Use the API

```bash
# Start the API server
npm run server

# Start a pipeline run
curl -X POST http://localhost:3001/pipeline/start
# → { "runId": "RUN-20260615-001", "message": "Pipeline started" }

# Poll run status while it runs
curl http://localhost:3001/runs/RUN-20260615-001

# See live logs
curl http://localhost:3001/logs/RUN-20260615-001

# Retry a failed step
curl -X POST http://localhost:3001/pipeline/step/voice \
  -H "Content-Type: application/json" \
  -d '{"runId":"RUN-20260615-001"}'

# Browse outputs
curl http://localhost:3001/ideas
curl http://localhost:3001/videos
curl http://localhost:3001/uploads
```

---

## New Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 5.2.1 | HTTP API server |
| `cors` | 2.8.6 | CORS middleware |
| `@types/express` | 5.0.6 | Express type definitions |
| `@types/cors` | 2.8.19 | cors type definitions |

---

## Known Issues (v1.5)

All v1 known issues carry over. Additional v1.5 notes:

| # | Issue | Notes |
|---|-------|-------|
| 1 | `POST /pipeline/step/:step` does not restore prior step context | Single-step retry works but context is empty — earlier step outputs not reloaded from disk |
| 2 | `POST /pipeline/start` creates a new run even if one is already running | No guard against concurrent runs — safe for single-user local use |
| 3 | Dashboard (Phase 8) not built | Vite frontend is v2 — API is ready for it |

---

## What Is Not Built Yet

| Item | Notes |
|------|-------|
| Vite dashboard | Phase 8 — all API endpoints it needs are ready |
| Rerun / resume from checkpoint | Skip completed steps when retrying — planned for v1.6 |
| `thumbnail.ts` | Generate thumbnail from script + first scene asset |

---

## Full Folder Structure (v1.5)

```
c1/
├── .env                          API keys + OAuth credentials (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── content.md                    Original pipeline design notes
├── CONTEXT.md                    Full technical reference for all modules
├── IMPLEMENTATION.md             Step-by-step build record
├── RELEASE-v1.md                 v1 snapshot
├── RELEASE-v1.5-PLAN.md          v1.5 design document
├── RELEASE-v1.5.md               This file
│
├── data/                         All generated assets (gitignored)
│   ├── runs/                     RUN-*.json — one per pipeline execution
│   ├── logs/                     RUN-*.log.ndjson — structured log events
│   ├── config/
│   │   └── settings.json         Editable pipeline settings
│   ├── story/
│   │   ├── ideas/                IDEA-*.json
│   │   ├── scripts/              SCR-*.json
│   │   ├── characters/           CHAR-*.json
│   │   └── scenes/               SCN-*.json
│   ├── media/
│   │   ├── audio/                AUD-*.json
│   │   ├── captions/             CAP-*.json
│   │   ├── videos/               VID-*.json
│   │   ├── metadata/             META-*.json
│   │   └── uploads/              UPL-*.json
│   ├── assets/
│   │   ├── SCN-*-NN.jpg/.mp4     Pexels scene assets
│   │   ├── SCN-*.manifest.json   Asset manifest per run
│   │   ├── audio/                AUD-*.wav
│   │   └── captions/             CAP-*.srt
│   └── tmp/                      Scene clips during render (auto-deleted)
│
├── output/
│   └── videos/                   VID-*.mp4 — final rendered Shorts
│
└── src/
    ├── index.ts                  Entry point — calls runPipeline(), 4 lines
    ├── config/
    │   └── env.ts                Typed env config (all 5 credentials)
    ├── pipeline/                 v1.5 — orchestration layer
    │   ├── pipeline-context.ts   Types: RunRecord, StepRecord, StepEvent, STEP_ORDER
    │   ├── run-step.ts           Step wrapper — tracks status, persists after each transition
    │   ├── step-registry.ts      Maps StepName → module function (STEP_REGISTRY)
    │   └── run-pipeline.ts       Full run orchestrator
    ├── services/                 v1.5 — shared service layer
    │   ├── run.service.ts        CRUD for RunRecord
    │   ├── log.service.ts        NDJSON logger + reader
    │   ├── asset.service.ts      List wrappers for all asset collections
    │   └── settings.service.ts   Read/write settings.json
    ├── api/                      v1.5 — Express API
    │   ├── server.ts             Express app, port 3001
    │   ├── runs.routes.ts        /runs
    │   ├── pipeline.routes.ts    /pipeline
    │   ├── assets.routes.ts      /assets /ideas /videos /uploads /settings
    │   └── logs.routes.ts        /logs
    ├── services/
    │   └── gemini.service.ts     Shared Gemini client singleton
    └── modules/                  v1 — engine (untouched)
        ├── storage.ts
        ├── id-generator.ts
        ├── story/
        │   ├── base.ts, idea.ts, script.ts, character.ts, scene.ts
        └── media/
        │   ├── visual-search.ts, pexels.ts, downloader.ts
        │   ├── voice.ts, caption.ts, renderer.ts, ffmpeg-utils.ts
        │   ├── metadata.ts, image-prompt.ts (reference only)
        └── youtube/
            ├── auth.ts, client.ts, uploader.ts, youtube.ts
```

---

## Run Record Lifecycle

```
POST /pipeline/start
        ↓
runService.create()  →  RUN-*.json written (status: "running", all steps: "pending")
        ↓
for each step in STEP_ORDER:
  runStep()
    ├── markStepStarted()   → step: "running",   history: [{event: "started"}]
    ├── STEP_REGISTRY[step](ctx)
    └── on success: markStepCompleted() → step: "completed", history: [{event: "completed", outputId}]
        on failure: markStepFailed()    → step: "failed",    history: [{event: "failed", error}]
                                          run stops, remaining steps stay "pending"
        ↓
markRunCompleted()  →  status: "completed", finishedAt set
  or
markRunFailed()     →  status: "failed",    error set
```

The dashboard polls `GET /runs/:id` every few seconds. It reads `steps` for the progress
table and `history` for the event timeline. Logs come from `GET /logs/:runId`.

---

## Environment Variables

All in `.env` at the project root:

```
# Gemini — story generation + TTS
GEMINI_API_KEY=

# Pexels — stock photo and video search
PEXELS_API_KEY=

# YouTube — OAuth credentials from Google Cloud Console
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
```

No new env vars in v1.5. The API server reads from the same `.env`.

---

## v1 → v1.5 Migration

If you were running v1 and pull v1.5:

| What | Status | Action needed |
|------|--------|---------------|
| `npm start` | ✅ unchanged | None — still runs the full pipeline |
| `src/modules/` | ✅ unchanged | None |
| `src/index.ts` | ⚠️ changed | Now calls `runPipeline()` — same behavior, different entry |
| `data/` structure | ⚠️ new dirs | `data/runs/`, `data/logs/`, `data/config/` created automatically on first run |
| `npm install` | required | `express` and `cors` added — run once |

Nothing breaks. The pipeline produces the same outputs as before. The new
directories are created automatically by the services on first use.

---

## See Also

- `RELEASE-v1.md` — v1 complete pipeline documentation
- `RELEASE-v1.5-PLAN.md` — original design document for this release
- `IMPLEMENTATION.md` — full step-by-step build record
- `CONTEXT.md` — full technical reference for all modules
