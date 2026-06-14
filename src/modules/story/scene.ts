import { gemini } from "../../services/gemini.service";
import { storage } from "../storage";
import { deriveSceneFileId, deriveSceneId } from "../id-generator";
import { StoryScript } from "./script";
import { StoryCharacter } from "./character";

export type ScenePurpose =
  | "hook"
  | "setup"
  | "escalation"
  | "climax"
  | "ending";

export interface StoryScene {
  id: string;
  sceneNumber: number;
  purpose: ScenePurpose;
  description: string;
  emotion: string; // single primary emotion only
  duration: number;
}

export interface StorySceneFile {
  id: string;
  scriptId: string;
  title: string;
  scenes: StoryScene[];
  createdAt: string;
}

function buildPrompt(
  script: StoryScript,
  characters: StoryCharacter[],
): string {
  const characterList = characters
    .map((c) => `- ${c.name}: ${c.appearance}`)
    .join("\n");

  return `
You are a visual scene director for short-form video content.

Convert this narrator script into exactly 5 visual scenes for a ${script.estimatedDuration}-second video.

Script:
Hook: ${script.hook}
Setup: ${script.setup}
Escalation: ${script.escalation}
Climax: ${script.climax}
Ending: ${script.ending}

Characters (use these exact names and descriptions — never say "a woman" or "the man"):
${characterList}

Rules:
- One scene per script section: hook → setup → escalation → climax → ending
- Describe ONLY what is visible on screen
- Use character names, not generic references like "the woman" or "a figure"
- No narration or dialogue
- No camera instructions — do not write "close-up", "wide shot", "pan", "zoom", or any filming term
- Keep descriptions concise, vivid, and specific — one or two sentences max
- Assign ONE single primary emotion per scene (one word, e.g. "dread", "grief", "awe")
- Assign duration in seconds — all 5 must sum to exactly ${script.estimatedDuration} seconds

Return ONLY valid JSON — an array of exactly 5 objects:
[
  { "sceneNumber": 1, "purpose": "hook",       "description": "", "emotion": "", "duration": 0 },
  { "sceneNumber": 2, "purpose": "setup",      "description": "", "emotion": "", "duration": 0 },
  { "sceneNumber": 3, "purpose": "escalation", "description": "", "emotion": "", "duration": 0 },
  { "sceneNumber": 4, "purpose": "climax",     "description": "", "emotion": "", "duration": 0 },
  { "sceneNumber": 5, "purpose": "ending",     "description": "", "emotion": "", "duration": 0 }
]
`.trim();
}

export class SceneGenerator {
  async generate(
    script: StoryScript,
    characters: StoryCharacter[],
  ): Promise<StorySceneFile> {
    console.log(`🎥 Generating scenes for: ${script.title}`);

    const response = await gemini.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: buildPrompt(script, characters),
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    const parsed: Array<{
      sceneNumber: number;
      purpose: ScenePurpose;
      description: string;
      emotion: string;
      duration: number;
    }> = JSON.parse(text);

    const fileId = deriveSceneFileId(script.id);

    const scenes: StoryScene[] = parsed.map((raw) => ({
      id: deriveSceneId(script.id, raw.sceneNumber),
      sceneNumber: raw.sceneNumber,
      purpose: raw.purpose,
      description: raw.description,
      emotion: raw.emotion,
      duration: raw.duration,
    }));

    const sceneFile: StorySceneFile = {
      id: fileId,
      scriptId: script.id,
      title: script.title,
      scenes,
      createdAt: new Date().toISOString(),
    };

    await storage.save("story/scenes", sceneFile.id, sceneFile);

    return sceneFile;
  }
}
