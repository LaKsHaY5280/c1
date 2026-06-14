import { gemini } from "../../services/gemini.service";
import { storage } from "../storage";
import { AssetType, parseId } from "../id-generator";
import { StoryIdea } from "./idea";

export interface StoryScript {
  id: string;
  ideaId: string;
  title: string;
  hook: string;
  setup: string;
  escalation: string;
  climax: string;
  ending: string;
  emotion: string;       // drives voice style  e.g. "sadness", "dread", "awe"
  storyType: string;     // drives scene style  e.g. "family-secret", "haunted-place"
  estimatedDuration: number;
  visualMoments: string[];
  createdAt: string;
}

function deriveScriptId(ideaId: string): string {
  // IDEA-DRM-20260614-005 → SCR-DRM-20260614-005
  const { genre, date, sequence } = parseId(ideaId);
  const seq = String(sequence).padStart(3, "0");
  return `${AssetType.SCRIPT}-${genre}-${date}-${seq}`;
}

function buildPrompt(idea: StoryIdea): string {
  return `
You are an expert YouTube Shorts storyteller.

Your task is to convert the provided story idea into a highly engaging 60-second narrator-style script optimized for retention, emotional impact, and visual storytelling.

Requirements:
- Narrator style only. No dialogue unless absolutely necessary.
- Hook viewers within the first 3 seconds. Create curiosity immediately.
- Escalate tension throughout the story.
- Every section should naturally lead into the next.
- The ending must create a strong emotional reaction: surprise, shock, sadness, fear, or awe.
- The story should be easy to understand when heard only once.
- Keep language simple and conversational.
- Optimize for AI-generated visuals later.
- Each section should contain clear visual moments that can become separate video scenes.
- Target duration: 45–60 seconds.

Story Idea:
Title: ${idea.title}
Idea: ${idea.idea}
Current Hook: ${idea.hook}
Viral Angle: ${idea.viralAngle}

Section Guidelines:
- hook: First 1-2 sentences. Must instantly grab attention.
- setup: Introduce the situation.
- escalation: Make things increasingly interesting, strange, emotional, or scary.
- climax: Biggest reveal or turning point.
- ending: Final emotional punch.
- visualMoments: 5 separate visual descriptions. Each represents a future AI video scene. Short and descriptive. No camera instructions. Only describe what is visible.

Return ONLY valid JSON:
{
  "hook": "",
  "setup": "",
  "escalation": "",
  "climax": "",
  "ending": "",
  "emotion": "the single dominant emotion the viewer should feel e.g. sadness, dread, awe, fear, longing, shock",
  "storyType": "a short hyphenated label for the story archetype e.g. family-secret, haunted-place, lost-love, false-reality, forbidden-power",
  "estimatedDuration": 60,
  "visualMoments": ["", "", "", "", ""]
}
`.trim();
}

export class ScriptGenerator {
  async generate(idea: StoryIdea): Promise<StoryScript> {
    console.log(`📝 Generating script for: ${idea.title}`);

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: buildPrompt(idea),
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);

    const id = deriveScriptId(idea.id);

    const script: StoryScript = {
      id,
      ideaId: idea.id,
      title: idea.title,
      hook: parsed.hook,
      setup: parsed.setup,
      escalation: parsed.escalation,
      climax: parsed.climax,
      ending: parsed.ending,
      emotion: parsed.emotion ?? "",
      storyType: parsed.storyType ?? "",
      estimatedDuration: parsed.estimatedDuration ?? 60,
      visualMoments: parsed.visualMoments ?? [],
      createdAt: new Date().toISOString(),
    };

    await storage.save("story/scripts", script.id, script);

    return script;
  }
}
