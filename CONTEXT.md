# Project Context — AI Shorts Content Pipeline

Automated pipeline that generates YouTube Shorts content using Gemini AI.
One video per day, 7 genres rotating by day of the week.

---

## Pipeline Flow

```
Idea → Script → Characters → Scenes → Image Prompts
```

Each step produces a JSON file saved to `data/` or `media/`.
All assets share a traceable ID lineage:

```
IDEA-DRM-20260614-001
  └── SCR-DRM-20260614-001
        ├── CHAR-DRM-20260614-001
        ├── SCN-DRM-20260614-001          (scene file — contains all 5 scenes)
        │     ├── SCN-DRM-20260614-001-01
        │     ├── SCN-DRM-20260614-001-02
        │     ├── SCN-DRM-20260614-001-03
        │     ├── SCN-DRM-20260614-001-04
        │     └── SCN-DRM-20260614-001-05
        └── PROMPT-DRM-20260614-001       (prompt file — contains all 5 prompts)
              ├── PROMPT-DRM-20260614-001-01
              ├── PROMPT-DRM-20260614-001-02
              ├── PROMPT-DRM-20260614-001-03
              ├── PROMPT-DRM-20260614-001-04
              └── PROMPT-DRM-20260614-001-05
```

---

## Genre Schedule

| Day       | Genre   | Code |
|-----------|---------|------|
| Monday    | Horror  | HOR  |
| Tuesday   | Mystery | MYS  |
| Wednesday | Sci-Fi  | SCI  |
| Thursday  | Fantasy | FAN  |
| Friday    | Thriller| THR  |
| Saturday  | Romance | ROM  |
| Sunday    | Drama   | DRM  |

---

## Data Storage Layout

```
data/
  story/
    ideas/          IDEA-*.json
    scripts/        SCR-*.json
    characters/     CHAR-*.json
    scenes/         SCN-*.json
media/
  image-prompts/    PROMPT-*.json
```

---

## Project Root

```
c1/
├── .env                        GEMINI_API_KEY
├── package.json
├── tsconfig.json
├── content.md                  Full pipeline design doc (non-code)
├── CONTEXT.md                  This file
├── data/                       Generated JSON assets (gitignored)
├── output/                     Future: rendered video output
└── src/
```

---

## src/ File Structure

```
src/
├── index.ts                    Entry point — runs the full pipeline
├── config/
│   └── env.ts                  Loads .env, exports env.geminiApiKey
├── services/
│   └── gemini.service.ts       Instantiates GoogleGenAI client
└── modules/
    ├── storage.ts              File-based JSON persistence (Storage class)
    ├── id-generator.ts         ID generation and derivation utilities
    ├── story/
    │   ├── base.ts             Shared utilities for all story generators
    │   ├── idea.ts             Step 1 — generates story idea
    │   ├── script.ts           Step 2 — expands idea into structured script
    │   ├── character.ts        Step 3 — extracts characters from script
    │   └── scene.ts            Step 4 — converts script into 5 visual scenes
    └── media/
        └── image-prompt.ts     Step 5 — generates image prompts per scene
```

---

## File Reference

---

### `src/index.ts`

Entry point. Runs the full pipeline sequentially.

```
bootstrap()   async — orchestrates all 5 pipeline steps in order
```

**Imports:** IdeaGenerator, ScriptGenerator, CharacterGenerator, SceneGenerator, ImagePromptGenerator

---

### `src/config/env.ts`

Loads `.env` via dotenv and exports typed config.

```
env           const — { geminiApiKey: string | undefined }
```

---

### `src/services/gemini.service.ts`

Singleton Gemini client used by all generators via `base.ts`.

```
gemini        const GoogleGenAI — initialized with env.geminiApiKey
```

---

### `src/modules/storage.ts`

File-based JSON storage. All data written to `data/` directory.

```
class Storage
  private dataDir        "data"
  save<T>()              writes data/collection/id.json
  load<T>()              reads and parses data/collection/id.json, returns null if missing
  exists()               checks if data/collection/id.json exists
  list()                 returns array of filenames in a collection directory
  getNextSequence()      returns files.length + 1 for auto-incrementing IDs

storage                  const Storage — singleton instance exported for use everywhere
```

---

### `src/modules/id-generator.ts`

All ID generation, parsing, and derivation logic.

**Enums / Constants**

```
enum AssetType
  IDEA      "IDEA"
  SCRIPT    "SCR"
  CHARACTER "CHAR"
  SCENE     "SCN"
  PROMPT    "PROMPT"
  VIDEO     "VID"
  AUDIO     "AUD"
  CAPTION   "CAP"
  THUMBNAIL "THM"
  METADATA  "META"

GENRE_CODES   Record<string, string> — genre name → 3-letter code
```

**Functions**

```
getGenreCode(genre)             string → 3-letter genre code (HOR, MYS, SCI, FAN, THR, ROM, DRM, GEN)
generateId(type, genre, seq)    builds IDEA-DRM-20260614-001 style ID
parseId(id)                     splits ID into { type, genre, date, sequence }
deriveScriptId        →         not exported; lives inside script.ts
deriveSceneFileId(scriptId)     SCR-* → SCN-* (scene collection file)
deriveSceneId(scriptId, n)      SCR-* + scene number → SCN-*-02 (individual scene)
deriveImagePromptId(sceneId)    SCN-*-02 → PROMPT-*-02
deriveCharacterId(scriptId)     SCR-* → CHAR-*
```

---

### `src/modules/story/base.ts`

Shared utilities imported by every story and media generator.

```
const MODEL             "gemini-2.5-flash-lite" — single place to change the model

generateJson<T>(prompt) async — sends prompt to Gemini, parses JSON response, returns T

interface BaseFile
  id          string
  scriptId    string
  title       string
  createdAt   string

now()                   returns new Date().toISOString()
```

---

### `src/modules/story/idea.ts`

Step 1 — Generates one story idea based on today's genre.

**Constants**

```
DAY_SCHEDULE            Record<number, string> — day index (0–6) → genre name
JSON_SCHEMA             shared JSON return schema appended to all 7 genre prompts
GENRE_PROMPTS           Record<string, string> — 7 genre-specific viral prompts
```

**Interface**

```
interface StoryIdea
  id                string   IDEA-GEN-DATE-SEQ
  title             string
  idea              string
  hook              string   opening line for the video
  genre             string   set from schedule, not by AI
  targetAudience    string
  viralAngle        string   why this will get shared
  createdAt         string
```

**Exports**

```
getTodaysGenre()            returns genre name for current day of week
class IdeaGenerator
  generate(genreOverride?)  async → StoryIdea — uses override or today's genre
```

**Storage:** `data/story/ideas/IDEA-*.json`

---

### `src/modules/story/script.ts`

Step 2 — Expands a StoryIdea into a full structured script with world context.

**Interface**

```
interface StoryScript
  id                string   SCR-GEN-DATE-SEQ
  ideaId            string
  title             string
  hook              string   first 1–2 sentences
  setup             string
  escalation        string
  climax            string
  ending            string
  emotion           string   dominant emotion — drives voice style
  emotionArc        string[] [hook, setup, escalation, climax, ending] emotions
  storyType         string   e.g. "family-secret", "haunted-place"
  location          string   e.g. "suburban family home"
  timePeriod        string   e.g. "modern day", "early 2000s"
  visualStyle       string   e.g. "cinematic realistic drama"
  colorMood         string   e.g. "muted and melancholic"
  weather           string   e.g. "overcast", "night rain"
  estimatedDuration number   seconds (target 45–60)
  visualMoments     string[] 5 short visual descriptions
  createdAt         string
```

**Internal**

```
deriveScriptId(ideaId)   IDEA-* → SCR-* (same genre/date/seq)
buildPrompt(idea)        constructs Gemini prompt from StoryIdea
```

**Exports**

```
class ScriptGenerator
  generate(idea)   async → StoryScript
```

**Storage:** `data/story/scripts/SCR-*.json`

---

### `src/modules/story/character.ts`

Step 3 — Extracts characters from the script. Does not invent — reads pronouns and references.

**Interfaces**

```
interface StoryCharacter
  name            string
  role            "protagonist" | "antagonist" | "supporting"
  age             number
  gender          string   must match pronouns in script
  appearance      string   physical traits only — injected into image prompts
  clothing        string   one consistent outfit — injected into image prompts
  emotionProfile  string   inner state across story arc

interface StoryCharacterFile extends BaseFile
  characters      StoryCharacter[]
```

**Internal**

```
buildPrompt(script)   constructs 3-step extraction prompt
```

**Exports**

```
class CharacterGenerator
  generate(script)   async → StoryCharacterFile
```

**Storage:** `data/story/characters/CHAR-*.json`

---

### `src/modules/story/scene.ts`

Step 4 — Converts script into exactly 5 visual scenes. Emotion inherited from emotionArc.

**Types / Interfaces**

```
type ScenePurpose   "hook" | "setup" | "escalation" | "climax" | "ending"

interface StoryScene
  id            string   SCN-GEN-DATE-SEQ-NN (e.g. -01 through -05)
  sceneNumber   number
  purpose       ScenePurpose
  description   string   one sentence — what is happening, no camera language
  emotion       string   single word — from script.emotionArc
  duration      number   seconds — all 5 sum to estimatedDuration

interface StorySceneFile extends BaseFile
  scenes        StoryScene[]
```

**Internal**

```
buildPrompt(script, characters)   constructs scene generation prompt
```

**Exports**

```
class SceneGenerator
  generate(script, characters)   async → StorySceneFile
```

**Storage:** `data/story/scenes/SCN-*.json`

---

### `src/modules/media/image-prompt.ts`

Step 5 — Generates image prompts per scene. Splits scene-specific content from shared style.

**Interfaces**

```
interface ImagePrompt
  id              string   PROMPT-GEN-DATE-SEQ-NN
  sceneId         string
  sceneNumber     number
  purpose         string
  prompt          string   scene-specific content only (AI generated, <80 words)
  baseStyle       string   shared style block (code assembled, same for all scenes)
  negativePrompt  string
  fullPrompt      string   prompt + baseStyle — send this to image model

interface ImagePromptFile
  id              string   PROMPT-GEN-DATE-SEQ
  scriptId        string
  title           string
  baseStyle       string   stored once at file level
  prompts         ImagePrompt[]
  createdAt       string
```

**Constants**

```
NEGATIVE_PROMPT   string — universal negative prompt for all scenes
```

**Internal**

```
buildBaseStyle(script)              assembles style block from script fields + quality tags
                                    fields: visualStyle, colorMood, weather, timePeriod
                                    + photorealistic, highly detailed, cinematic lighting,
                                      vertical composition, 9:16 aspect ratio

buildAiPrompt(scenes, characters,   constructs batch prompt — AI generates scene content only
  script)                           one focal moment per scene, no style/quality tags
```

**Exports**

```
class ImagePromptGenerator
  generate(sceneFile, characters,   async → ImagePromptFile
    script)
```

**Storage:** `media/image-prompts/PROMPT-*.json`

---

## Dependencies

| Package          | Version   | Purpose                        |
|------------------|-----------|--------------------------------|
| @google/genai    | ^2.8.0    | Gemini API client              |
| dotenv           | ^17.4.2   | Load .env into process.env     |
| uuid             | ^14.0.0   | (installed, not currently used)|
| tsx              | ^4.22.4   | Run TypeScript directly        |
| typescript       | ^6.0.3    | Compiler                       |
| @types/node      | ^25.9.3   | Node.js type definitions       |

## Scripts

```
npm run dev     tsx watch src/index.ts   (auto-restarts on file change)
npm start       tsx src/index.ts         (single run)
```

## TypeScript Config

```
target           ES2022
module           NodeNext
moduleResolution NodeNext
rootDir          ./src
outDir           ./dist
strict           true
```
