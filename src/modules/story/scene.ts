import { storage } from "../storage";
import { deriveSceneFileId, deriveSceneId } from "../id-generator";
import { generateJson, BaseFile, now } from "./base";
import { StoryScript } from "./script";
import { StoryCharacter } from "./character";

export type ScenePurpose = "hook" | "setup" | "escalation" | "climax" | "ending";
export type MediaType = "photo" | "video";

export interface StoryScene {
  id: string;
  sceneNumber: number;
  purpose: ScenePurpose;
  description: string;        // what is happening — one sentence, no camera language
  emotion: string;            // single primary emotion — inherited from script emotionArc
  duration: number;
  preferredMediaType: MediaType; // "photo" for static moments, "video" for action/motion
}

export interface StorySceneFile extends BaseFile {
  scenes: StoryScene[];
}

function buildPrompt(script: StoryScript, characters: StoryCharacter[]): string {
  const characterList = characters
    .map((c) => `- ${c.name} (${c.role}): ${c.appearance}, ${c.clothing}`)
    .join("\n");

  const emotionArc = script.emotionArc.length === 5
    ? script.emotionArc
    : ["curiosity", "unease", "tension", "shock", "grief"];

  return `
You are a visual scene director for short-form AI-generated video content.

Convert this narrator script into exactly 5 visual scenes.

Script:
Hook: ${script.hook}
Setup: ${script.setup}
Escalation: ${script.escalation}
Climax: ${script.climax}
Ending: ${script.ending}

Characters (use these exact names — never write "a woman", "the man", "a figure"):
${characterList}

World Context (all scenes must stay within this world):
Location: ${script.location}
Time Period: ${script.timePeriod}
Visual Style: ${script.visualStyle}

Emotion Arc (assign these emotions in order — do not change them):
1. hook       → ${emotionArc[0]}
2. setup      → ${emotionArc[1]}
3. escalation → ${emotionArc[2]}
4. climax     → ${emotionArc[3]}
5. ending     → ${emotionArc[4]}

Description Rules:
- Describe WHAT IS HAPPENING — one simple sentence
- Use character names, never generic references
- No camera instructions — no "close-up", "wide shot", "pan", "zoom"
- No narration or dialogue
- Do NOT describe lighting, color, or mood
- Simple: "Emma finds the letter on the kitchen table" not "hands trembling, Emma clutches the envelope"

preferredMediaType Rules:
- "video" if the scene has movement, action, or transition (walking, running, opening, searching)
- "photo" if the scene is a still emotional moment (staring, holding, sitting, crying)
- Default to "photo" when unsure

Duration: all 5 must sum to exactly ${script.estimatedDuration} seconds.

Return ONLY valid JSON — an array of exactly 5 objects:
[
  { "sceneNumber": 1, "purpose": "hook",       "description": "", "emotion": "${emotionArc[0]}", "duration": 0, "preferredMediaType": "photo" },
  { "sceneNumber": 2, "purpose": "setup",      "description": "", "emotion": "${emotionArc[1]}", "duration": 0, "preferredMediaType": "photo" },
  { "sceneNumber": 3, "purpose": "escalation", "description": "", "emotion": "${emotionArc[2]}", "duration": 0, "preferredMediaType": "video" },
  { "sceneNumber": 4, "purpose": "climax",     "description": "", "emotion": "${emotionArc[3]}", "duration": 0, "preferredMediaType": "photo" },
  { "sceneNumber": 5, "purpose": "ending",     "description": "", "emotion": "${emotionArc[4]}", "duration": 0, "preferredMediaType": "photo" }
]
`.trim();
}

export class SceneGenerator {
  async generate(script: StoryScript, characters: StoryCharacter[]): Promise<StorySceneFile> {
    console.log(`🎥 Generating scenes for: ${script.title}`);

    const parsed = await generateJson<Array<{
      sceneNumber: number;
      purpose: ScenePurpose;
      description: string;
      emotion: string;
      duration: number;
      preferredMediaType: MediaType;
    }>>(buildPrompt(script, characters));

    const scenes: StoryScene[] = parsed.map((raw) => ({
      id: deriveSceneId(script.id, raw.sceneNumber),
      sceneNumber: raw.sceneNumber,
      purpose: raw.purpose,
      description: raw.description,
      emotion: raw.emotion,
      duration: raw.duration,
      preferredMediaType: raw.preferredMediaType ?? "photo",
    }));

    const sceneFile: StorySceneFile = {
      id: deriveSceneFileId(script.id),
      scriptId: script.id,
      title: script.title,
      scenes,
      createdAt: now(),
    };

    await storage.save("story/scenes", sceneFile.id, sceneFile);
    return sceneFile;
  }
}
