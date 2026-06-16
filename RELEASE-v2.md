# Release v2.0 — Thumbnail, Queue, and Scheduler

**Date:** 2026-06-16
**Status:** Complete. v2.0 features implemented on top of v1.5/v1.6.
**Built on top of:** v1.5 + v1.6 — all existing pipeline modules untouched.

---

## What Changed From v1.5

v1.5 was a generation machine: run it, it produces a video, it stops.

v2.0 turns it into a production loop:

```
Plan → Queue → Generate → Thumbnail → Upload → (Measure → Learn → Plan Better)
```

Three new capabilities added:

1. **Thumbnail generation** — the pipeline now produces a JPG alongside every video
2. **Queue** — content jobs can be planned ahead and stored before generation runs
3. **Scheduler** — a background ticker fires queued jobs automatically when they come due

---

## New Architecture (v2.0)

```
src/modules/    engine        (v1 — untouched)
src/pipeline/   orchestration (v1.5 — unchanged)
src/services/   shared logic  (v1.5 + v2.0 additions)
src/api/        HTTP bridge   (v1.5 + v2.0 additions)
```

No existing files in `src/modules/` were modified.

---

## Feature 1 — Thumbnail Generation

### Module

**`src/modules/media/thumbnail.ts`** (new)

Extracts a single frame from the rendered MP4 at 10% of the video's total duration (avoids black frames at the start), then burns the video title as text overlay using ffmpeg's `drawtext` filter.

Uses the same bundled `@ffmpeg-installer/ffmpeg` binary as the rest of the pipeline — no new dependencies.

Frame extraction + title overlay rules:
- Frame at `max(1, floor(durationSeconds × 0.1))` seconds
- Title truncated to 40 characters at the last word boundary
- Bold white text, black border (width 4), black shadow
- Positioned bottom-center with 120px bottom margin
- Output: 1080×1920 (9:16 vertical — same as the video)

```typescript
interface ThumbnailFile {
  id: string;               // THM-HOR-20260615-001
  scriptId: string;
  videoId: string;
  title: string;
  thumbnailPath: string;    // output/thumbnails/THM-*.jpg
  sourceAssetPath: string;  // the video it was extracted from
  frameTimeSeconds: number;
  createdAt: string;
}
```

Storage:
- JPG:  `output/thumbnails/THM-*.jpg`
- JSON: `data/media/thumbnails/THM-*.json`

### Pipeline integration

The `thumbnail` step is now **step 13** (the final step), running after `upload`.

| File | Change |
|------|--------|
| `pipeline-context.ts` | `thumbnail` added to `StepName` union and `STEP_ORDER` |
| `step-registry.ts` | `thumbnail` entry added, `thumbnailFile` on `PipelineContext` |
| `hydrate-context.ts` | `thumbnailFile` loaded from disk on step retry |
| `id-generator.ts` | `deriveThumbnailId(scriptId)` added, `generateTypedId()` helper added |

### API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/assets/thumbnails` | List all thumbnail JSON records |
| `GET` | `/thumbnails/:filename` | Serve static JPG file |

---

## Feature 2 — Queue

### Service

**`src/services/queue.service.ts`** (new)

CRUD for `QueueItem` records in `data/queue/`. Queue items are independent of runs — one item will eventually produce one run.

```typescript
interface QueueItem {
  id: string;            // QUEUE-YYYYMMDD-NNN
  genre: string;
  scheduledFor: string;  // ISO datetime
  status: QueueStatus;   // pending | queued | generating | generated | uploaded | failed | skipped
  runId?: string;        // linked once generation starts
  videoId?: string;
  thumbnailId?: string;
  metadataId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

Key methods:
- `create(genre, scheduledFor, notes?)` — new queue item
- `list()` — all items, sorted by scheduledFor ascending
- `update(id, patch)` — partial update, auto-sets `updatedAt`
- `remove(id)` — delete by ID
- `getDueItems()` — items with `status === "pending"` and `scheduledFor <= now`
- `getNextPending()` — oldest pending item regardless of schedule time

### API

**`src/api/queue.routes.ts`** (new)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/queue` | List all queue items |
| `GET` | `/queue/:id` | Get one item |
| `POST` | `/queue` | Create item — body: `{ genre, scheduledFor, notes? }` |
| `PUT` | `/queue/:id` | Partial update |
| `DELETE` | `/queue/:id` | Delete item |
| `POST` | `/queue/:id/trigger` | Manually trigger generation for this item now |

The `/queue/:id/trigger` endpoint enforces the same concurrent-run protection as `/pipeline/start`. It creates a run, links it to the queue item, and updates status to `generating`. The queue item status updates to `generated` on success or `failed` on error.

---

## Feature 3 — Scheduler

### Service

**`src/services/scheduler.service.ts`** (new)

A `setInterval`-based ticker that fires every 60 seconds. On each tick:
1. Checks `runService.getActiveRun()` — skips if anything is running
2. Calls `queueService.getDueItems()` — finds items with `scheduledFor <= now` and `status === "pending"`
3. Takes the oldest due item, creates a run, and triggers `runPipeline()` in the background
4. Updates the queue item status as the run progresses

```typescript
schedulerService.start()     // begin 60s ticking
schedulerService.stop()      // stop ticking
schedulerService.tick()      // run one check immediately
schedulerService.isRunning() // boolean
```

The scheduler is not started automatically — call `schedulerService.start()` in `server.ts` if you want auto-firing, or trigger manually via the API.

### API

**`src/api/scheduler.routes.ts`** (new)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scheduler/status` | Running state, active run, count of due items |
| `POST` | `/scheduler/tick` | Run one check — triggers the oldest due item if pipeline is free |
| `POST` | `/scheduler/next` | Force-trigger the next pending item regardless of schedule time |

---

## New Data Layout

```
data/
  queue/                QUEUE-*.json          (one per planned content job)   ← new
  media/
    thumbnails/         THM-*.json            (thumbnail metadata)            ← new
  ...all other collections unchanged

output/
  thumbnails/           THM-*.jpg             (generated thumbnail images)    ← new
  videos/               VID-*.mp4             (unchanged)
```

---

## Updated Pipeline (13 steps)

```
1  idea
2  script
3  characters
4  scenes
5  visualSearch
6  pexels
7  manifest
8  voice
9  captions
10 render         → output/videos/VID-*.mp4
11 metadata       → data/media/metadata/META-*.json
12 upload         → data/media/uploads/UPL-*.json
13 thumbnail      → output/thumbnails/THM-*.jpg    ← new
```

---

## New ID Types

| Prefix | Derivation | Example |
|--------|-----------|---------|
| `THM` | `deriveThumbnailId(scriptId)` | `THM-HOR-20260615-001` |
| `QUEUE` | `generateTypedId(AssetType.QUEUE, seq)` | `QUEUE-20260616-001` |

---

## New Dependencies

None. All v2.0 features use existing dependencies (ffmpeg, express, fs).

---

## New API Endpoints Summary

| Method | Path | Feature |
|--------|------|---------|
| `GET` | `/assets/thumbnails` | Thumbnail list |
| `GET` | `/thumbnails/:filename` | Static thumbnail JPG |
| `GET` | `/queue` | Queue list |
| `GET` | `/queue/:id` | Queue item |
| `POST` | `/queue` | Create queue item |
| `PUT` | `/queue/:id` | Update queue item |
| `DELETE` | `/queue/:id` | Delete queue item |
| `POST` | `/queue/:id/trigger` | Manually trigger item |
| `GET` | `/scheduler/status` | Scheduler state |
| `POST` | `/scheduler/tick` | Manual tick |
| `POST` | `/scheduler/next` | Force next pending item |

---

## v2.2 Patch — Operational Hardening

| Fix | Details |
|-----|---------|
| **A — Terminology** | `run-pipeline.ts` comment corrected to "13-step" — terminology is now consistent across all code, comments, and docs |
| **B — Hardened cancel** | `CancellationToken` now carries an `AbortController` (`token.signal`) and an ffmpeg process handle. `cancel()` aborts the signal (kills in-flight Gemini fetch calls) and calls `ffmpegCmd.kill("SIGKILL")` on any registered command. `ffmpeg-utils.ts` updated to accept an `onCmd` callback; `renderer.ts` registers each command before execution. `PipelineContext` carries `token?` so the render step can pass it through |
| **C — Run start mutex** | `run.service.ts` adds an atomic file lock (`data/runs/.pipeline.lock`) via `fs.writeFile` with `flag: "wx"`. `withLock<T>(fn)` is exported and used by `/pipeline/start`, `/queue/:id/trigger`, and the scheduler tick — all three paths now go through the same exclusive lock, preventing duplicate runs from any concurrent trigger source |
| **D — Scheduler startup policy** | `Settings` gains `schedulerEnabled: boolean` (default `true`). `server.ts` reads settings on boot and only starts the scheduler if `schedulerEnabled` is true. Toggling it off in the Settings page pauses auto-triggering without stopping an active run. Dashboard `SettingsForm` has a new "Scheduler Auto-Start" switch |
| **E — Runs table pagination** | `RunsPage` now paginates at 25 runs per page with prev/next controls and an `X–Y of N` counter. Runs are already sorted newest-first by `run.service.ts` so page 1 always shows the most recent activity |

---

## Known Issues

None.

---

## See Also

- `RELEASE-v1.5.md` — v1.5 + v1.6 backend release notes
- `CONTEXT.md` — full technical reference
- `IMPLEMENTATION.md` — step-by-step build record
- `../seventh_lantern_v_2_plan.md` — original v2 design document

---

## What Is Not Built Yet (v2.2+)

| Item | Notes |
|------|-------|
| Analytics ingestion | Pull views/likes from YouTube API — planned v2.2 |
| Analytics dashboard | Performance charts per genre/title — planned v2.2 |
| Feedback loop | Recommendations from analytics — planned v2.3 |
| Queue auto-planning | Generate queue items from feedback scores — planned v2.3 |
| Thumbnail A/B testing | Multiple frame candidates with quality scoring |
