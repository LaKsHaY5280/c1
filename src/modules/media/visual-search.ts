import { generateJson } from "../story/base";
import { StoryScene } from "../story/scene";

export interface VisualSearchQuery {
  sceneId: string;
  sceneNumber: number;
  purpose: string;
  query: string;  // Pexels-friendly search term
}

function buildPrompt(scenes: StoryScene[]): string {
  const sceneList = scenes
    .map((s) => `Scene ${s.sceneNumber} (${s.purpose}): ${s.description}`)
    .join("\n");

  return `
You are a stock photo search specialist.

Convert each story scene description into a short, generic search query
that will return real results on a stock photo/video site like Pexels.

Rules:
- No character names — use generic descriptions (e.g. "elderly woman" not "Eleanor")
- No story-specific props unless they are common (e.g. "old letter" is fine, "mahogany box" is too specific)
- 2–5 words maximum
- Describe the visual subject, not the emotion or narrative
- Think: what would a stock photographer title this photo?

Bad:  "Eleanor pulls a dusty box from under the bed"
Good: "woman discovering old box"

Bad:  "Arthur reads the foreclosure notice in despair"
Good: "man reading bad news letter"

Scenes:
${sceneList}

Return ONLY valid JSON — an array of exactly ${scenes.length} objects:
[
  {
    "sceneNumber": 1,
    "query": ""
  }
]
`.trim();
}

export class VisualSearchGenerator {
  async generate(scenes: StoryScene[]): Promise<VisualSearchQuery[]> {
    console.log(`🔍 Generating search queries for ${scenes.length} scenes`);

    const parsed = await generateJson<Array<{
      sceneNumber: number;
      query: string;
    }>>(buildPrompt(scenes));

    return parsed.map((raw) => {
      const scene = scenes.find((s) => s.sceneNumber === raw.sceneNumber)!;
      return {
        sceneId: scene.id,
        sceneNumber: raw.sceneNumber,
        purpose: scene.purpose,
        query: raw.query,
      };
    });
  }
}
