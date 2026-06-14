import { gemini } from "../../services/gemini.service";
import { storage } from "../storage";
import { deriveCharacterId } from "../id-generator";
import { StoryScript } from "./script";

export interface StoryCharacter {
  name: string;
  age: number;
  gender: string;
  appearance: string; // specific visual description used in every scene and image prompt
  emotionProfile: string; // e.g. "grieving but resilient" — informs voice and scene tone
}

export interface StoryCharacterFile {
  id: string;
  scriptId: string;
  title: string;
  characters: StoryCharacter[];
  createdAt: string;
}

function buildPrompt(script: StoryScript): string {
  return `
You are a character designer for short-form AI-generated video content.

Extract and define all named characters that appear in this story script.

Script:
Hook: ${script.hook}
Setup: ${script.setup}
Escalation: ${script.escalation}
Climax: ${script.climax}
Ending: ${script.ending}

Requirements:
- Identify every distinct character who appears or is referenced in the story
- Give each character a specific, memorable name
- Appearance must be highly specific — it will be used directly in AI image generation prompts
  Include: hair color and length, eye color, age range, build, and one distinctive clothing item
- emotionProfile must be a short phrase describing their inner state throughout the story
- Keep the cast small — 1 to 3 characters maximum for a 60-second video
- Gender must be one of: "male", "female", "non-binary"

Return ONLY valid JSON — an array of character objects:
[
  {
    "name": "",
    "age": 0,
    "gender": "",
    "appearance": "",
    "emotionProfile": ""
  }
]
`.trim();
}

export class CharacterGenerator {
  async generate(script: StoryScript): Promise<StoryCharacterFile> {
    console.log(`👤 Generating characters for: ${script.title}`);

    const response = await gemini.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: buildPrompt(script),
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    const parsed: StoryCharacter[] = JSON.parse(text);

    const id = deriveCharacterId(script.id);

    const characterFile: StoryCharacterFile = {
      id,
      scriptId: script.id,
      title: script.title,
      characters: parsed,
      createdAt: new Date().toISOString(),
    };

    await storage.save("story/characters", characterFile.id, characterFile);

    return characterFile;
  }
}
