# Implementation Status

Automated YouTube Shorts pipeline. One video per day, genre rotates by day of the week.
Run with `npm start`.

---

## What Is Built

### Pipeline Overview

```
Idea → Script → Characters → Scenes → VisualSearch → Pexels → Manifest → Voice → Captions → Render → Metadata → Upload
  1        2          3          4           5            6        7          8        9         10        11        12
```

12 executable steps tracked by the runtime (`STEP_ORDER` in `pipeline-context.ts`).

> Note: the original CLI docs counted 13 steps by numbering Pexels search (6), asset download (7),
> and manifest (8) separately. In v1.5 the registry combines search+download into one `pexels` step,
> making `manifest` step 7 and collapsing the total to 12. The underlying modules are unchanged.

All steps are implemented and wired through `src/pipeline/run-pipeline.ts`.

> **v1.5 update:** `src/index.ts` is now a thin 4-line entry point that calls `runPipeline()`.
> The full orchestration lives in `src/pipeline/run-pipeline.ts`.

---

## v1.5 — Control Layer

The v1.5 upgrade wraps the 12-step engine in a control layer for dashboard visibility.
Core modules are untouched. New layers added:

```
src/pipeline/   — run lifecycle, step tracking, registry
src/services/   — run records, logs, asset listing, settings
src/api/        — Express API the dashboard calls
```

### New Files

| File | Purpose |
|------|---------|
| `src/pipeline/pipeline-context.ts` | `RunRecord`, `StepRecord`, `StepEvent` types + `STEP_ORDER` |
| `src/pipeline/run-step.ts` | Step wrapper — marks running/completed/failed, persists after each transition |
| `src/pipeline/step-registry.ts` | Maps every `StepName` to its module function. Only file that knows module → step mapping |
| `src/pipeline/run-pipeline.ts` | Iterates `STEP_ORDER`, calls `runStep()` for each, marks run complete or failed |
| `src/services/run.service.ts` | CRUD for `RunRecord` — create, load, list, mark step/run states |
| `src/services/log.service.ts` | NDJSON structured logger — appends to `data/logs/RUN-*.log.ndjson`, also prints to terminal |
| `src/services/asset.service.ts` | List wrappers for ideas, scripts, videos, uploads, metadata, asset files |
| `src/services/settings.service.ts` | Read/write `data/config/settings.json` with typed defaults |
| `src/api/server.ts` | Express app on port 3001, mounts all routers |
| `src/api/runs.routes.ts` | `GET /runs`, `GET /runs/:id` |
| `src/api/pipeline.routes.ts` | `POST /pipeline/start`, `POST /pipeline/step/:step` |
| `src/api/assets.routes.ts` | `GET /assets`, `/assets/ideas`, `/assets/videos`, `/assets/uploads`, `GET\|PUT /assets/settings` |
| `src/api/logs.routes.ts` | `GET /logs/:runId` |

### Run Record

Every pipeline execution creates a `RUN-YYYYMMDD-NNN.json` file in `data/runs/`.

```json
{
  "id": "RUN-20260615-001",
  "status": "running",
  "currentStep": "voice",
  "steps": {
    "idea":   { "status": "completed", "outputId": "IDEA-HOR-20260615-001" },
    "voice":  { "status": "running" }
  },
  "history": [
    { "step": "idea", "event": "started",   "timestamp": "..." },
    { "step": "idea", "event": "completed", "timestamp": "...", "outputId": "IDEA-HOR-20260615-001" }
  ]
}
```

`steps` — current state map (O(1) lookup, one row per step in the dashboard)
`history` — append-only event log (survives retries, supports timeline view)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs` | List all runs, newest first |
| `GET` | `/runs/:id` | Full run record with steps + history |
| `POST` | `/pipeline/start` | Start a full pipeline run (async, returns `runId`) |
| `POST` | `/pipeline/step/:step` | Run one step — body: `{ runId }` |
| `GET` | `/assets` | List asset files in `data/assets/` |
| `GET` | `/ideas` | List all idea JSON files |
| `GET` | `/videos` | List all video JSON files |
| `GET` | `/uploads` | List all upload JSON files |
| `GET` | `/settings` | Read current settings |
| `PUT` | `/settings` | Update settings (partial merge) |
| `GET` | `/logs/:runId` | All log events for a run |
| `GET` | `/health` | Server health check |

### Scripts

```
npm start          # CLI pipeline run — no server needed
npm run server     # Start API on port 3001
npm run server:dev # API with auto-restart on file changes
```

---

## Step-by-Step

### Step 1 — Idea Generation
**File:** `src/modules/story/idea.ts`

Picks today's genre from a day-of-week schedule and sends a genre-specific viral prompt to Gemini.
The AI returns a title, idea, hook, target audience, and viral angle.
Genre is assigned by the schedule — the AI never decides genre.

Genre schedule:
| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|-----|-----|-----|-----|-----|-----|-----|
| Horror | Mystery | Sci-Fi | Fantasy | Thriller | Romance | Drama |

Output: `data/story/ideas/IDEA-HOR-YYYYMMDD-001.json`

---

### Step 2 — Script Generation
**File:** `src/modules/story/script.ts`

Expands the idea into a structured 45–60 second narrator-style script with 5 sections:
hook → setup → escalation → climax → ending.

Also extracts world context baked into every downstream step:
- `emotion` — dominant single emotion (drives voice style)
- `emotionArc` — one emotion per scene, in order
- `location`, `timePeriod`, `visualStyle`, `colorMood`, `weather`
- `storyType` — short archetype slug e.g. `family-secret`
- `estimatedDuration` — target seconds, used to set scene durations

Output: `data/story/scripts/SCR-HOR-YYYYMMDD-001.json`

---

### Step 3 — Character Extraction
**File:** `src/modules/story/character.ts`

Reads the script and extracts up to 3 characters. Does not invent — reads pronouns and references.
Gender is locked to what the script implies (he/him → male, she/her → female).
Outputs `appearance` and `clothing` as verbatim strings ready for image generation prompts.

Output: `data/story/characters/CHAR-HOR-YYYYMMDD-001.json`

---

### Step 4 — Scene Generation
**File:** `src/modules/story/scene.ts`

Converts the script into exactly 5 visual scenes, one per narrative section.
Emotions are inherited from `script.emotionArc` — the AI fills them in verbatim.

Each scene has:
- `id` — `SCN-HOR-YYYYMMDD-001-01` through `-05`
- `description` — one sentence: what is happening, no camera language
- `emotion` — single word, from emotion arc
- `duration` — seconds, all 5 sum to `estimatedDuration`
- `preferredMediaType` — `"photo"` for still moments, `"video"` for action/motion

Output: `data/story/scenes/SCN-HOR-YYYYMMDD-001.json`

---

### Step 5 — Visual Search Query Generation
**File:** `src/modules/media/visual-search.ts`

Batch converts all 5 scene descriptions into short, generic Pexels-friendly search terms.
All 5 scenes are processed in a single Gemini call.

Rules enforced by the prompt:
- No character names (uses generic descriptors instead)
- 2–5 words maximum
- Describes the visual subject, not the emotion or story narrative

Example: `"Emma finds the letter"` → `"woman reading old letter"`

Not persisted to disk — passed directly to the next step.

---

### Step 6 — Pexels Search + Asset Download (`pexels` step)
**Files:** `src/modules/media/pexels.ts`, `src/modules/media/downloader.ts`

For each scene, calls either `searchPhotos()` or `searchVideos()` based on `preferredMediaType`.
Always requests portrait orientation for Shorts compatibility.
Picks the first result. Downloads sequentially to respect Pexels rate limits.

Photo → saved as `SCN-*-NN.jpg`
Video → saved as `SCN-*-NN.mp4`

Downloads land in: `data/assets/`

> In the v1.5 registry, Pexels search and asset download are handled together inside the single
> `pexels` StepName entry. The underlying modules (`pexels.ts`, `downloader.ts`) are unchanged.

---

### Step 7 — Asset Manifest (`manifest` step)
**File:** `src/modules/media/downloader.ts` (`saveManifest`)

After all downloads complete, writes a JSON manifest recording:
- Which Pexels asset was chosen per scene
- `mediaType`, `pexelsId`, `credit`, `pexelsUrl`, `assetPath`
- Tied to the pipeline run via the scene file ID

Output: `data/assets/SCN-HOR-YYYYMMDD-001.manifest.json`

---

### Step 8 — Voice / Narration Audio
**File:** `src/modules/media/voice.ts`

Builds narration by joining the 5 script sections with paragraph breaks.
Sends a structured TTS prompt to `gemini-3.1-flash-tts-preview` using voice `Kore`.

The prompt includes:
- An audio profile and title
- Director's notes derived from `script.emotion`, `script.colorMood`, `script.weather`
- The full narration as the transcript

Gemini returns raw PCM (mono, 24 kHz, 16-bit). The `wav` package wraps it in a
valid RIFF/WAV container before writing to disk.

Duration is calculated from PCM byte length: `bytes / (sampleRate × channels × bytesPerSample)`.

Audio output: `data/assets/audio/AUD-HOR-YYYYMMDD-001.wav`
JSON metadata: `data/media/audio/AUD-HOR-YYYYMMDD-001.json`

---

### Step 9 — Captions
**File:** `src/modules/media/caption.ts`

No transcription, no audio upload. The narration text is already known from the voice step,
so Gemini is only asked to split and time it — not to guess what was said.

Input: `voiceFile.narration` + `voiceFile.duration`

Gemini splits the narration into 3–8 word segments and distributes timestamps
across the full audio duration (max 4 seconds per segment).

SRT formatting is pure TypeScript — `toSrt()` converts the segment array into standard
SRT format with no AI involvement:

```
1
00:00:00,000 --> 00:00:02,500
My father died a hero
```

SRT output: `data/assets/captions/CAP-HOR-YYYYMMDD-001.srt`
JSON metadata: `data/media/captions/CAP-HOR-YYYYMMDD-001.json`

---

### Step 10 — Renderer
**Files:** `src/modules/media/renderer.ts`, `src/modules/media/ffmpeg-utils.ts`

Takes all pipeline assets and produces the final vertical MP4.
Uses `@ffmpeg-installer/ffmpeg` — no system ffmpeg install required.

Input:
- `AssetManifest` — which file path to use per scene
- `Map<sceneId, duration>` — how long each scene plays
- `VoiceFile` — narration WAV path
- `CaptionFile` — SRT path

Render pipeline:
1. Sort assets by scene order (`-01` through `-05`)
2. Per scene: `photoToClip` (Ken Burns slow zoom) or `videoToClip` (trim + 9:16 crop) → silent clip
3. `concatenateClips` — joins all clips via ffmpeg concat demuxer (stream copy, no re-encode)
4. `burnCaptionsAndMuxAudio` — burns SRT subtitles, muxes narration WAV as AAC
5. Temp clips in `data/tmp/VID-*/` always cleaned up in a `finally` block

Video output: `output/videos/VID-HOR-YYYYMMDD-001.mp4`
JSON metadata: `data/media/videos/VID-HOR-YYYYMMDD-001.json`

---

### Step 11 — Metadata
**File:** `src/modules/media/metadata.ts`

Generates all YouTube publishing metadata in a single Gemini call.
Designed to be the single source of truth for `youtube.ts`, thumbnail generation, and A/B testing.

Input: `StoryIdea` + `StoryScript` + `VideoFile`

Gemini generates 10 title options, a description, and 10 tags. The module then:
- Enforces the 60-character title limit (truncates if needed)
- Picks `bestTitle` as the first option, stores all 10 in `alternativeTitles`
- Applies genre-specific hashtag sets from a preset map (no AI for hashtags)
- Clamps `uploadPriority` to 0–100
- Assigns `category` from a genre → YouTube category name map

Hard limits frozen in constants so downstream tools can rely on them:

| Field | Limit |
|-------|-------|
| `title` | 60 chars max |
| `alternativeTitles` | 10 entries |
| `hashtags` | 5 (genre preset) |
| `tags` | 10 |
| `description` | 500 chars max |
| `language` | `"en"` |

Output: `data/media/metadata/META-HOR-YYYYMMDD-001.json`

---

### Step 12 — YouTube Upload (`upload` step)
**Files:** `src/modules/youtube/youtube.ts`, `src/modules/youtube/uploader.ts`, `src/modules/youtube/client.ts`

Uploads the final MP4 to YouTube as a private video using the OAuth refresh token.
Private by default — change visibility only after manual review.

Authentication flow (one-time setup):
```
npx tsx src/modules/youtube/auth.ts
```
Uses `localhost:3000` as the redirect URI (the deprecated `oob` flow no longer works).
Before running, add `http://localhost:3000/callback` to your OAuth client's authorized redirect URIs
in Google Cloud Console → APIs & Services → Credentials.

The script starts a local HTTP server, opens the browser automatically, catches the authorization
code from the callback, and exchanges it for tokens without any copy-pasting.
Refresh token is printed to the terminal — copy it to `.env` as `YOUTUBE_REFRESH_TOKEN`.
After that the pipeline authenticates silently on every run.

Upload flow:
1. `client.ts` creates an authenticated YouTube client from stored credentials
2. `uploader.ts` calls `youtube.videos.insert()` with title, description, tags, category, mp4 stream
3. Description field = `metadata.description` + hashtags joined on a new line
4. Category name is mapped to YouTube's numeric category ID
5. `youtube.ts` saves the result and returns an `UploadFile` record

Output: `data/media/uploads/UPL-HOR-YYYYMMDD-001.json`

```json
{
  "id": "UPL-HOR-20260615-001",
  "youtubeId": "dQw4w9WgXcQ",
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "visibility": "private",
  "title": "The Baby Monitor Had a Second Viewer"
}
```

---

## ID Lineage

Every asset in a pipeline run shares the same genre, date, and sequence number.
The type prefix is the only part that changes.

```
IDEA-HOR-20260615-001
  └── SCR-HOR-20260615-001
        ├── CHAR-HOR-20260615-001
        ├── AUD-HOR-20260615-001
        ├── CAP-HOR-20260615-001
        ├── VID-HOR-20260615-001
        ├── META-HOR-20260615-001
        └── SCN-HOR-20260615-001
              ├── SCN-HOR-20260615-001-01  → data/assets/SCN-HOR-20260615-001-01.jpg/.mp4
              ├── SCN-HOR-20260615-001-02  → data/assets/SCN-HOR-20260615-001-02.jpg/.mp4
              ├── SCN-HOR-20260615-001-03  → data/assets/SCN-HOR-20260615-001-03.jpg/.mp4
              ├── SCN-HOR-20260615-001-04  → data/assets/SCN-HOR-20260615-001-04.jpg/.mp4
              └── SCN-HOR-20260615-001-05  → data/assets/SCN-HOR-20260615-001-05.jpg/.mp4
```

Derivation functions in `src/modules/id-generator.ts`:
- `deriveScriptId`    IDEA-* → SCR-*
- `deriveCharacterId` SCR-*  → CHAR-*
- `deriveSceneFileId` SCR-*  → SCN-*  (collection)
- `deriveSceneId`     SCR-* + N → SCN-*-NN
- `deriveAudioId`     SCR-*  → AUD-*
- `deriveCaptionId`   SCR-*  → CAP-*
- `deriveVideoId`     SCR-*  → VID-*
- `deriveMetadataId`  SCR-*  → META-*

---

## Data Layout

```
data/
  runs/           RUN-*.json           (run records with step statuses)
  logs/           RUN-*.log.ndjson     (structured log events per run, NDJSON)
  config/
    settings.json                      (user-editable pipeline settings)
  story/
    ideas/          IDEA-*.json
    scripts/        SCR-*.json
    characters/     CHAR-*.json
    scenes/         SCN-*.json
  media/
    audio/          AUD-*.json         (voice metadata)
    captions/       CAP-*.json         (caption metadata)
    videos/         VID-*.json         (video metadata)
    metadata/       META-*.json        (publishing metadata)
    uploads/        UPL-*.json         (YouTube upload records)
  assets/
    SCN-*-NN.jpg                       (Pexels photos)
    SCN-*-NN.mp4                       (Pexels videos)
    SCN-*.manifest.json                (asset manifest per run)
    audio/
      AUD-*.wav                        (narration audio)
    captions/
      CAP-*.srt                        (caption file)
  tmp/
    VID-*/                             (scene clips during rendering, auto-deleted)

output/
  videos/           VID-*.mp4          (final rendered Shorts)
```

---

## What Is Not Built Yet

| Module | Purpose | Notes |
|--------|---------|-------|
| `thumbnail.ts` | Generate a thumbnail image | Can be built from script fields + first scene asset |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | ^2.8.0 | Gemini API — story generation + TTS |
| `dotenv` | ^17.4.2 | Load `.env` |
| `wav` | 1.0.2 | Wrap raw PCM in RIFF/WAV container |
| `fluent-ffmpeg` | 2.1.3 | ffmpeg TypeScript wrapper |
| `@ffmpeg-installer/ffmpeg` | 1.1.0 | Bundled ffmpeg binary — no system install needed |
| `uuid` | ^14.0.0 | Installed, not currently used |
| `tsx` | ^4.22.4 | Run TypeScript directly |
| `typescript` | ^6.0.3 | Compiler |
| `@types/node` | ^25.9.3 | Node type definitions |
| `@types/wav` | 1.0.4 | Type definitions for wav |
| `@types/fluent-ffmpeg` | 2.1.28 | Type definitions for fluent-ffmpeg |
| `googleapis` | 173.0.0 | Google APIs client — YouTube Data API v3 |
| `express` | 5.2.1 | HTTP API server |
| `cors` | 2.8.6 | CORS middleware for Express |
| `@types/express` | 5.0.6 | Type definitions for Express |
| `@types/cors` | 2.8.19 | Type definitions for cors |

---

## Environment Variables

```
GEMINI_API_KEY          — required for all AI generation steps (story + TTS)
PEXELS_API_KEY          — required for photo/video search and download
YOUTUBE_CLIENT_ID       — OAuth client ID from Google Cloud Console
YOUTUBE_CLIENT_SECRET   — OAuth client secret from Google Cloud Console
YOUTUBE_REFRESH_TOKEN   — generated once by running: npx tsx src/modules/youtube/auth.ts
```

---

## v1.6 Patch — Stability & Integration

**Date:** 2026-06-16
Applied on top of v1.5. All changes are in `src/pipeline/` and `src/api/`.
Core modules (`src/modules/`) remain untouched.

### 1. Step Retry Context Hydration

**File:** `src/pipeline/hydrate-context.ts` (new)

Before this fix, `POST /pipeline/step/:step` started with an empty context, so any step that depended on earlier outputs (e.g. `render` needs `sceneFile`, `manifest`, `voiceFile`, `captionFile`) would immediately throw.

`hydrateContext(run)` rebuilds the full `PipelineContext` from disk:
1. Loads idea and script from `run.steps[...].outputId`
2. Derives all downstream IDs from `ctx.script.id` using id-generator functions
3. Loads manifest from `data/assets/SCN-*.manifest.json` (separate from storage collection)
4. Logs a summary line showing ✓/✗ per field

Updated `pipeline.routes.ts` to call `hydrateContext(run)` before every `runStep()` invocation.

### 2. Concurrent Run Protection

**File:** `src/api/pipeline.routes.ts` (updated)

`POST /pipeline/start` now calls `runService.getActiveRun()` before creating a new run. If a run with status `"running"` or `"pending"` exists, it returns:
```json
{ "error": "Pipeline already running", "runId": "RUN-...", "status": 409 }
```

Added `getActiveRun()` to `src/services/run.service.ts` — scans all run records and returns the first active one.

### 3. Settings Wired to All Modules

`voice.ts`, `caption.ts`, and the `upload` step in `step-registry.ts` now all call `settingsService.read()` at runtime instead of using hardcoded defaults:

| Module | Setting Used | Old Default |
|--------|-------------|-------------|
| `voice.ts` | `settings.ttsVoice` | hardcoded `"Kore"` |
| `caption.ts` | `settings.captionMaxWordsPerSegment` | hardcoded `8` |
| `step-registry.ts` upload step | `settings.defaultVisibility` | already correct in v1.5 |

### 4. Missing Asset Endpoints

**File:** `src/api/assets.routes.ts` (updated)

Added six missing endpoints to match all 9 data collections:
- `GET /assets/scripts` → `assetService.listScripts()`
- `GET /assets/characters` → `assetService.listCharacters()`
- `GET /assets/scenes` → `assetService.listScenes()`
- `GET /assets/audio` → `assetService.listAudio()`
- `GET /assets/captions` → `assetService.listCaptions()`
- `GET /assets/metadata` → `assetService.listMetadata()`

All collection routes live under `/assets/*` so they never conflict with the static `/videos` file server.

Updated `src/services/asset.service.ts` to expose all 9 list functions.

### 5. Static Video Serving

**File:** `src/api/server.ts` (updated)

```typescript
app.use("/videos", express.static(path.join(process.cwd(), "output", "videos")));
```

Dashboard can now stream `GET /videos/VID-HOR-20260615-001.mp4` directly in a `<video>` element.

### 6. Cancel Endpoint

**File:** `src/api/pipeline.routes.ts` (updated)

```
POST /pipeline/cancel/:runId
```

- Validates that the run exists and is active (returns 409 if already completed/failed)
- Calls `runService.markRunFailed(run, "Cancelled by user")`
- Does not interrupt in-flight OS processes (ffmpeg, Gemini API calls continue until they finish)
- Returns `{ runId, message: "Run marked as cancelled" }`

### TypeScript Verification

Both projects compile clean after all changes:

```bash
cd Backend && npx tsc --noEmit   # Exit 0
cd Dashboard && npx tsc --noEmit # Exit 0
```
