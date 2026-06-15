# Release v1 — AI YouTube Shorts Pipeline

**Date:** 2026-06-15
**Status:** Complete end-to-end pipeline. Produces one vertical Short per run and uploads it to YouTube as private.

---

## What This Is

A fully automated Node.js / TypeScript pipeline that generates a YouTube Shorts video from scratch using:
- **Gemini AI** — story generation, TTS narration, caption timing
- **Pexels** — stock photos and videos per scene
- **ffmpeg** — video composition
- **YouTube Data API v3** — upload

One `npm start` runs all 13 steps and delivers a private video to your channel.

---

## Pipeline

```
Idea → Script → Characters → Scenes → Visual Search → Pexels Assets → Manifest
  1        2          3          4           5               6–7          8

→ Voice → Captions → Render → Metadata → Upload
    9        10         11        12        13
```

| Step | Module | What It Does |
|------|--------|-------------|
| 1 | `story/idea.ts` | Picks today's genre, generates story idea via Gemini |
| 2 | `story/script.ts` | Expands idea into 5-section narrator script (45–55s) |
| 3 | `story/character.ts` | Extracts up to 3 characters — does not invent |
| 4 | `story/scene.ts` | Converts script into 5 visual scenes with durations |
| 5 | `media/visual-search.ts` | Converts scene descriptions to Pexels search queries |
| 6–7 | `media/pexels.ts` + `downloader.ts` | Searches and downloads photo or video per scene |
| 8 | `media/downloader.ts` | Saves asset manifest for debugging and reruns |
| 9 | `media/voice.ts` | Generates narration WAV via Gemini TTS (voice: Kore) |
| 10 | `media/caption.ts` | Splits narration into timed SRT captions |
| 11 | `media/renderer.ts` | Composes scenes + audio + captions into final MP4 |
| 12 | `media/metadata.ts` | Generates title, description, hashtags, tags, priority |
| 13 | `youtube/youtube.ts` | Uploads final MP4 to YouTube as private |

---

## Genre Schedule

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|-----|-----|-----|-----|-----|-----|-----|
| Horror | Mystery | Sci-Fi | Fantasy | Thriller | Romance | Drama |

Genre is assigned by schedule — AI never picks the genre.

---

## Folder Structure

```
c1/
├── .env                        API keys and OAuth credentials (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── content.md                  Original pipeline design notes
├── CONTEXT.md                  Full technical reference for all modules
├── IMPLEMENTATION.md           Step-by-step build record
├── RELEASE-v1.md               This file
├── data/                       All generated intermediate assets (gitignored)
│   ├── story/
│   │   ├── ideas/              IDEA-*.json
│   │   ├── scripts/            SCR-*.json
│   │   ├── characters/         CHAR-*.json
│   │   └── scenes/             SCN-*.json
│   ├── media/
│   │   ├── audio/              AUD-*.json      (voice metadata)
│   │   ├── captions/           CAP-*.json      (caption metadata)
│   │   ├── videos/             VID-*.json      (video metadata)
│   │   ├── metadata/           META-*.json     (publishing metadata)
│   │   └── uploads/            UPL-*.json      (YouTube upload records)
│   ├── assets/
│   │   ├── SCN-*-NN.jpg/.mp4   (Pexels scene assets)
│   │   ├── SCN-*.manifest.json (asset manifest per run)
│   │   ├── audio/              AUD-*.wav
│   │   └── captions/           CAP-*.srt
│   └── tmp/                    Scene clips during render (auto-deleted)
├── output/
│   └── videos/                 VID-*.mp4       (final rendered Shorts)
└── src/
    ├── index.ts                Entry point — runs all 13 steps
    ├── config/
    │   └── env.ts              Typed env config
    ├── services/
    │   └── gemini.service.ts   Shared Gemini client
    └── modules/
        ├── storage.ts          File-based JSON persistence
        ├── id-generator.ts     ID generation and derivation
        ├── story/
        │   ├── base.ts         Shared Gemini JSON call + retry logic
        │   ├── idea.ts
        │   ├── script.ts
        │   ├── character.ts
        │   └── scene.ts
        ├── media/
        │   ├── visual-search.ts
        │   ├── pexels.ts
        │   ├── downloader.ts
        │   ├── voice.ts
        │   ├── caption.ts
        │   ├── renderer.ts
        │   ├── ffmpeg-utils.ts
        │   ├── metadata.ts
        │   └── image-prompt.ts  (reference only — not in pipeline)
        └── youtube/
            ├── auth.ts          One-time OAuth setup script
            ├── client.ts        Authenticated YouTube client
            ├── uploader.ts      youtube.videos.insert()
            └── youtube.ts       Orchestrator + UploadFile storage
```

---

## ID Lineage

Every asset in a run shares genre, date, and sequence. Only the type prefix changes.

```
IDEA-HOR-20260615-001
  └── SCR-HOR-20260615-001
        ├── CHAR-HOR-20260615-001
        ├── AUD-HOR-20260615-001
        ├── CAP-HOR-20260615-001
        ├── VID-HOR-20260615-001
        ├── META-HOR-20260615-001
        ├── UPL-HOR-20260615-001
        └── SCN-HOR-20260615-001
              ├── SCN-HOR-20260615-001-01
              ├── SCN-HOR-20260615-001-02
              ├── SCN-HOR-20260615-001-03
              ├── SCN-HOR-20260615-001-04
              └── SCN-HOR-20260615-001-05
```

---

## Environment Variables

All stored in `.env` at the project root.

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

### One-time YouTube OAuth setup

Before the first upload, generate your refresh token:

```
npx tsx src/modules/youtube/auth.ts
```

Prerequisites in Google Cloud Console:
1. Project created, YouTube Data API v3 enabled
2. OAuth consent screen configured (External, personal use)
3. OAuth 2.0 Client ID created (Desktop Application)
4. `http://localhost:3000/callback` added to Authorized Redirect URIs

The script opens the browser, you approve access, it catches the code automatically.
Refresh token is printed — copy it to `.env`. Never run again.

---

## External Services

| Service | Usage | Credentials |
|---------|-------|-------------|
| Google Gemini | Story generation, TTS, caption timing | `GEMINI_API_KEY` |
| Pexels | Stock photo and video search + download | `PEXELS_API_KEY` |
| YouTube Data API v3 | Video upload | OAuth (client ID + secret + refresh token) |

Models used:
- Story generation: `gemini-2.5-flash`
- TTS narration: `gemini-3.1-flash-tts-preview`

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | ^2.8.0 | Gemini API client |
| `dotenv` | ^17.4.2 | Load `.env` |
| `wav` | 1.0.2 | Wrap raw PCM in RIFF/WAV container |
| `fluent-ffmpeg` | 2.1.3 | ffmpeg TypeScript wrapper |
| `@ffmpeg-installer/ffmpeg` | 1.1.0 | Bundled ffmpeg binary |
| `googleapis` | 173.0.0 | YouTube Data API v3 |
| `uuid` | ^14.0.0 | Installed, not currently used |
| `tsx` | ^4.22.4 | Run TypeScript directly |
| `typescript` | ^6.0.3 | Compiler |
| `@types/node` | ^25.9.3 | Node type definitions |
| `@types/wav` | 1.0.4 | wav type definitions |
| `@types/fluent-ffmpeg` | 2.1.28 | fluent-ffmpeg type definitions |

---

## Known Issues

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 1 | Gemini TTS occasionally returns a 500 error | Voice step fails | Retry logic built in — max 3 retries with 2s/4s/8s backoff |
| 2 | Gemini TTS `UND_ERR_HEADERS_TIMEOUT` on slow responses | Voice step fails | 120s timeout set on the TTS client |
| 3 | Gemini story calls return 503 on busy API | Any step 1–5 fails | Retry logic in `generateJson` — max 3 retries |
| 4 | Pexels first result may not match scene context | Wrong visual tone | Acceptable for v1 — v2 should score results before picking |
| 5 | Caption timestamps are AI-estimated, not speech-aligned | Minor sync drift | Acceptable for v1 — true alignment needs Whisper or similar |
| 6 | `urn:ietf:wg:oauth:2.0:oob` is deprecated | auth.ts would fail | Fixed — uses `localhost:3000` callback instead |
| 7 | Narration can run long if Gemini ignores sentence limits | Video over 60s | Prompt enforces hard limits; still model-dependent |
| 8 | `uuid` package installed but unused | Dead dependency | Safe to remove in v2 cleanup |

---

## What Is Not Built Yet

| Module | Purpose |
|--------|---------|
| `thumbnail.ts` | Generate a thumbnail from script + first scene asset |
| Video visibility toggle | Programmatically move from private → public after review |
| Scheduling | Run automatically at a set time each day |
| Analytics ingestion | Pull view/retention data back into the system |

---

## How to Run

```bash
# Install dependencies (first time only)
npm install

# Run the full pipeline
npm start

# Run with auto-restart on file changes
npm run dev

# One-time YouTube OAuth setup
npx tsx src/modules/youtube/auth.ts
```
