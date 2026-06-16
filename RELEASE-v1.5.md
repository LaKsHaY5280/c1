# Release v1.5 — Dashboard-Ready Backend

**Date:** 2026-06-15
**Status:** Complete. All phases 1–7 implemented. Updated to v1.6 patch.
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

## What Was Built (v1.5 + v1.6 patch)

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

The only file that maps step names to module functions. `STEP_REGISTRY` is a `Record<StepName, StepFn>`.

Settings wired in:
- `voice` step reads `settings.ttsVoice` at runtime — no hardcoded voice name
- `captions` step reads `settings.captionMaxWordsPerSegment` at runtime
- `upload` step reads `settings.defaultVisibility` at runtime

**`src/pipeline/run-pipeline.ts`**

Creates a `RunRecord`, iterates `STEP_ORDER`, calls `runStep()` for each entry in `STEP_REGISTRY`, marks run `completed` or `failed` at the end.

**`src/pipeline/hydrate-context.ts`** (v1.6)

Rebuilds a complete `PipelineContext` from disk for single-step retry. Loads every available artifact (idea, script, characters, scenes, manifest, voice, captions, video, metadata) using IDs stored in the run's step records. Steps that haven't run yet are left `undefined` — the step validator throws a proper error if a required predecessor is absent.

**`src/index.ts`** (updated — was 150+ lines, now 4)

```typescript
import { runPipeline } from "./pipeline/run-pipeline";
runPipeline().catch((err) => { console.error(err); process.exit(1); });
```

---

### Phase 5 — Express API

**`src/api/server.ts`** — Express on port 3001

Static video serving:
```typescript
app.use("/videos", express.static(path.join(process.cwd(), "output", "videos")));
```

All API routes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs` | List all runs, newest first |
| `GET` | `/runs/:id` | Full run record with steps + history |
| `POST` | `/pipeline/start` | Start full pipeline run (rejects 409 if run already active) |
| `POST` | `/pipeline/step/:step` | Run one step with hydrated context — body: `{ runId }` |
| `POST` | `/pipeline/cancel/:runId` | Cancel a running/pending run |
| `GET` | `/assets` | List raw asset files in `data/assets/` |
| `GET` | `/assets/ideas` | List all idea JSON files |
| `GET` | `/assets/scripts` | List all script JSON files |
| `GET` | `/assets/characters` | List all character JSON files |
| `GET` | `/assets/scenes` | List all scene JSON files |
| `GET` | `/assets/audio` | List all voice JSON files |
| `GET` | `/assets/captions` | List all caption JSON files |
| `GET` | `/assets/videos` | List all video JSON files |
| `GET` | `/assets/uploads` | List all upload records |
| `GET` | `/assets/metadata` | List all metadata JSON files |
| `GET` | `/assets/settings` | Read current settings |
| `PUT` | `/assets/settings` | Update settings (partial merge) |
| `GET` | `/logs/:runId` | All log events for a run |
| `GET` | `/health` | Server health check |
| `GET` | `/videos/:filename` | Static MP4 file serving |

---

### Phase 6 — Settings File

**`src/services/settings.service.ts`** + **`data/config/settings.json`**

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
`PUT /assets/settings` writes partial updates via the API.

All three settings are now consumed at runtime:
- `ttsVoice` → `voice.ts` reads it before every TTS call
- `captionMaxWordsPerSegment` → `caption.ts` reads it before every caption call
- `defaultVisibility` → `step-registry.ts` upload step reads it before every upload

---

### Phase 7 — Service Layer

| File | Purpose |
|------|---------|
| `src/services/run.service.ts` | CRUD for `RunRecord` — create, load, list, all state transitions, `getActiveRun()` |
| `src/services/log.service.ts` | Logger factory + log file reader |
| `src/services/asset.service.ts` | List wrappers for all 9 asset collections |
| `src/services/settings.service.ts` | Read/write typed settings with defaults |

---

## v1.6 Patch — Stability Fixes

| Fix | Details |
|-----|---------|
| Step retry context hydration | `hydrateContext(run)` loads all disk artifacts before single-step retry — retry now works correctly for any step, not just step 1 |
| Concurrent run protection | `POST /pipeline/start` calls `runService.getActiveRun()` first; returns 409 if a run is already active |
| Settings wired to all modules | `voice.ts`, `caption.ts`, and the `upload` step all read from `settingsService.read()` instead of hardcoded defaults |
| Missing asset endpoints added | `/assets/scripts`, `/assets/characters`, `/assets/scenes`, `/assets/audio`, `/assets/captions`, `/assets/metadata` added to `assets.routes.ts`. All collection routes now live under `/assets/*` to avoid shadowing the static `/videos` middleware. |
| Static video serving | `app.use("/videos", express.static(...))` added to `server.ts` so the dashboard can stream MP4 files |
| Cancel endpoint | `POST /pipeline/cancel/:runId` marks a running/pending run as failed immediately |
| `getActiveRun()` added to run.service | Used by concurrent run protection and Topbar active run indicator |

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

## New Dependencies Added (v1.5)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 5.2.1 | HTTP API server |
| `cors` | 2.8.6 | CORS middleware |
| `@types/express` | 5.0.6 | Express type definitions |
| `@types/cors` | 2.8.19 | cors type definitions |

---

## Known Issues (v1.5 / v1.6)

| # | Issue | Notes |
|---|-------|-------|
| 1 | Cancel does not interrupt in-flight ffmpeg or Gemini | The run record is immediately marked failed but active OS processes continue to completion. Will improve with `AbortController` in a future release. |
| 2 | Dashboard (Phase 8) is separate project | Vite frontend is its own repo. All API endpoints it needs are ready. |

---

## What Is Not Built Yet

| Item | Notes |
|------|-------|
| `thumbnail.ts` | Generate thumbnail from script + first scene asset |
| Rerun / resume from checkpoint | Skip already-completed steps on retry — planned for v2 |

---

## See Also

- `RELEASE-v1.md` — v1 complete pipeline documentation
- `RELEASE-v1.5-PLAN.md` — original design document for this release
- `IMPLEMENTATION.md` — full step-by-step build record
- `CONTEXT.md` — full technical reference for all modules
