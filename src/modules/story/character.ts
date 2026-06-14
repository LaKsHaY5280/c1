import { storage } from "../storage";
import { deriveCharacterId } from "../id-generator";
import { generateJson, BaseFile, now } from "./base";
import { StoryScript } from "./script";

export interface StoryCharacter {
  name: string;
  role: "protagonist" | "antagonist" | "supporting";
  age: number;
  gender: string;
  appearance: string;     // physical traits only — used verbatim in image prompts
  clothing: string;       // consistent outfit across all scenes — used in image prompts
  emotionProfile: string; // inner state throughout the story — drives voice and scene tone
}

export interface StoryCharacterFile extends BaseFile {
  characters: StoryCharacter[];
}

function buildPrompt(script: StoryScript): string {
  return `
You are a character extraction specialist for short-form AI-generated video content.

STEP 1 — READ the script carefully and list every human character referenced.
STEP 2 — For each character, note EXACTLY how they are described: pronouns used, age cues, role in the story.
STEP 3 — Fill in the fields below strictly based on what you found. Do not add characters not in the script.

Script:
Hook: ${script.hook}
Setup: ${script.setup}
Escalation: ${script.escalation}
Climax: ${script.climax}
Ending: ${script.ending}

Story Type: ${script.storyType}
Setting: ${script.location}, ${script.timePeriod}

STRICT RULES — violating these will break the entire video pipeline:
- gender MUST match the pronouns and references in the script exactly
  "she/her" → "female", "he/him" → "male", ambiguous → "non-binary"
- Do NOT change a female character to male or vice versa under any circumstances
- Do NOT add characters that do not appear in the script
- Maximum 3 characters — a 60-second video cannot support more
- name: assign a fitting name that matches the character's implied gender, age, and setting
- appearance: physical traits only — hair color and length, eye color, build, skin tone
  Do NOT include clothing here
- clothing: one specific outfit consistent with the time period and setting
- emotionProfile: short phrase describing their emotional state across the full story arc
- appearance and clothing will be injected verbatim into AI image generation prompts — be specific

Return ONLY valid JSON — an array of character objects:
[
  {
    "name": "",
    "role": "protagonist",
    "age": 0,
    "gender": "",
    "appearance": "",
    "clothing": "",
    "emotionProfile": ""
  }
]
`.trim();
}

export class CharacterGenerator {
  async generate(script: StoryScript): Promise<StoryCharacterFile> {
    console.log(`👤 Extracting characters for: ${script.title}`);

    const characters = await generateJson<StoryCharacter[]>(buildPrompt(script));

    const characterFile: StoryCharacterFile = {
      id: deriveCharacterId(script.id),
      scriptId: script.id,
      title: script.title,
      characters,
      createdAt: now(),
    };

    await storage.save("story/characters", characterFile.id, characterFile);
    return characterFile;
  }
}
