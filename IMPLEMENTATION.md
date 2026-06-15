# Implementation Status

Automated YouTube Shorts pipeline. One video per day, genre rotates by day of the week.
Run with `npm start`.

---

## What Is Built

### Pipeline Overview

```
Idea → Script → Characters → Scenes → Visual Search → Pexels Assets → Manifest → Voice → Captions
  1        2          3          4           5               6–7          8          9        10
```

All 10 steps are implemented and wired in `src/index.ts`.

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

### Steps 6 & 7 — Pexels Search + Asset Download
**Files:** `src/modules/media/pexels.ts`, `src/modules/media/downloader.ts`

For each scene, calls either `searchPhotos()` or `searchVideos()` based on `preferredMediaType`.
Always requests portrait orientation for Shorts compatibility.
Picks the first result. Downloads sequentially to respect Pexels rate limits.

Photo → saved as `SCN-*-NN.jpg`
Video → saved as `SCN-*-NN.mp4`

Downloads land in: `data/assets/`

---

### Step 8 — Asset Manifest
**File:** `src/modules/media/downloader.ts` (`saveManifest`)

After all downloads complete, writes a JSON manifest recording:
- Which Pexels asset was chosen per scene
- `mediaType`, `pexelsId`, `credit`, `pexelsUrl`, `assetPath`
- Tied to the pipeline run via the scene file ID

Output: `data/assets/SCN-HOR-YYYYMMDD-001.manifest.json`

---

### Step 9 — Voice / Narration Audio
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

### Step 10 — Captions
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

## ID Lineage

Every asset in a pipeline run shares the same genre, date, and sequence number.
The type prefix is the only part that changes.

```
IDEA-HOR-20260615-001
  └── SCR-HOR-20260615-001
        ├── CHAR-HOR-20260615-001
        ├── AUD-HOR-20260615-001
        ├── CAP-HOR-20260615-001
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

---

## Data Layout

```
data/
  story/
    ideas/          IDEA-*.json
    scripts/        SCR-*.json
    characters/     CHAR-*.json
    scenes/         SCN-*.json
  media/
    audio/          AUD-*.json         (voice metadata)
    captions/       CAP-*.json         (caption metadata)
  assets/
    SCN-*-NN.jpg                       (Pexels photos)
    SCN-*-NN.mp4                       (Pexels videos)
    SCN-*.manifest.json                (asset manifest per run)
    audio/
      AUD-*.wav                        (narration audio)
    captions/
      CAP-*.srt                        (caption file)

output/
  (reserved for final rendered videos — nothing written here yet)
```

---

## What Is Not Built Yet

| Module | Purpose | Notes |
|--------|---------|-------|
| `ffmpeg.ts` | Compose scenes + audio + captions into final video | Depends on all assets being ready |
| `thumbnail.ts` | Generate thumbnail image | Can be parallelized with ffmpeg |
| `metadata.ts` | YouTube title, description, tags | Can be generated from script fields |

The next logical step is ffmpeg composition — all inputs are now ready: scenes, audio, and captions.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | ^2.8.0 | Gemini API — story generation + TTS |
| `dotenv` | ^17.4.2 | Load `.env` |
| `wav` | 1.0.2 | Wrap raw PCM in RIFF/WAV container |
| `uuid` | ^14.0.0 | Installed, not currently used |
| `tsx` | ^4.22.4 | Run TypeScript directly |
| `typescript` | ^6.0.3 | Compiler |
| `@types/node` | ^25.9.3 | Node type definitions |
| `@types/wav` | 1.0.4 | Type definitions for wav |

---

## Environment Variables

```
GEMINI_API_KEY   — required for all AI generation steps (story + TTS)
PEXELS_API_KEY   — required for photo/video search and download
```
