# 🎬 AI Shorts Content Pipeline

A complete asset pipeline for generating AI-powered short-form videos (YouTube Shorts, TikTok, Reels).

---

# 📦 Content Assets

## 1. Story Idea

### Purpose

The seed for the entire content pipeline.

Helps:

* Generate unique stories
* Avoid repetitive content
* Create endless variations

### Example

```json
{
  "idea": "A boy discovers that every mirror in his house shows tomorrow instead of today."
}
```

### AI Required

✅ Yes

---

## 2. Story Script

### Purpose

Core narrative used for:

* Narration
* Scene generation
* Metadata generation
* Character extraction

### Example

```json
{
  "title": "The Mirrors of Tomorrow",
  "story": "Every night Ryan noticed something strange..."
}
```

### AI Required

✅ Yes

---

## 3. Character Profiles

### Purpose

Maintain character consistency across all generated scenes.

### Example

```json
{
  "name": "Ryan",
  "age": 12,
  "appearance": "short black hair, blue hoodie"
}
```

### AI Required

✅ Yes

---

## 4. Scene Breakdown

### Purpose

Split the story into visual segments.

### Example

```json
[
  {
    "scene": 1,
    "description": "Ryan enters a dark hallway"
  }
]
```

### AI Required

✅ Yes

---

## 5. Video Prompts

### Purpose

Prompts for AI video generation.

### Example

```text
Dark hallway, moonlight, frightened boy,
cinematic horror, realistic, 9:16
```

### AI Required

✅ Yes

---

## 6. Narration Script

### Purpose

Script used for text-to-speech generation.

Usually identical to the story script but may be optimized for:

* Better pacing
* Natural speech
* Dramatic emphasis

### Example

```text
Every night, Ryan heard a knock...
```

### AI Required

⚠️ Optional

---

## 7. Voice Audio

### Output

```text
story.mp3
```

### Purpose

Generated narration audio.

### Generation Method

* Text-to-Speech (TTS)

### AI Required

🤖 TTS

---

## 8. Captions

### Output

```text
captions.srt
```

### Purpose

* Burned subtitles
* Accessibility
* Better viewer retention

### AI Required

❌ No

Can be generated automatically from narration timestamps.

---

## 9. AI Video Scenes

### Output

```text
scene1.mp4
scene2.mp4
scene3.mp4
```

### Purpose

Visual storytelling segments generated from scene prompts.

### AI Required

🤖 AI Video Generation

---

## 10. Final Assembled Video

### Output

```text
final-short.mp4
```

### Purpose

Upload-ready short video.

### Generation Method

* FFmpeg
* Video editing pipeline

### AI Required

❌ No

---

## 11. Thumbnail Prompt

### Purpose

Prompt for AI thumbnail generation.

### Example

```text
Scared child staring at closet,
red glowing eyes,
cinematic horror
```

### AI Required

✅ Yes

---

## 12. Thumbnail Image

### Output

```text
thumbnail.png
```

### Purpose

YouTube thumbnail.

### AI Required

🤖 AI Image Generation

---

## 13. Metadata

### Output

```json
{
  "title": "...",
  "description": "...",
  "hashtags": []
}
```

### Purpose

* SEO optimization
* Discovery
* Upload automation

### AI Required

✅ Yes

---

## 14. Analytics Snapshot (Future)

### Output

```json
{
  "views": 1000,
  "likes": 100
}
```

### Purpose

Track performance and improve future story generation.

### AI Required

❌ No

---

# 🤖 AI Requirements Overview

| Asset              | AI Required              |
| ------------------ | ------------------------ |
| Story Idea         | ✅                        |
| Story Script       | ✅                        |
| Character Profiles | ✅                        |
| Scene Breakdown    | ✅                        |
| Video Prompts      | ✅                        |
| Narration Script   | ⚠️ Usually same as story |
| Voice Audio        | 🤖 TTS                   |
| Captions           | ❌ Auto-generated         |
| Video Scenes       | 🤖 AI Video              |
| Final Video        | ❌ FFmpeg                 |
| Thumbnail Prompt   | ✅                        |
| Thumbnail Image    | 🤖 AI Image              |
| Metadata           | ✅                        |
| Analytics Snapshot | ❌                        |

---

# 🔄 Complete Pipeline Flow

```text
Story Idea
    ↓
Story Script
    ↓
Character Profiles
    ↓
Scene Breakdown
    ↓
Video Prompts
    ↓
AI Video Generation
    ↓
Scene Videos
    ↓
Narration Script
    ↓
TTS Audio
    ↓
Captions
    ↓
FFmpeg Assembly
    ↓
Final Video
    ↓
Thumbnail Prompt
    ↓
Thumbnail Image
    ↓
Metadata
    ↓
YouTube Upload
    ↓
Analytics Collection
```

---

# 🎯 Final Deliverables

```text
final-short.mp4
thumbnail.png
metadata.json
```

These three assets are sufficient for a fully automated upload pipeline.
