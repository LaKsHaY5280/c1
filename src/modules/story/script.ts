import { storage } from "../storage";
import { AssetType, parseId } from "../id-generator";
import { generateJson, now } from "./base";
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
  emotion: string;        // dominant overall emotion — drives voice style
  emotionArc: string[];   // one emotion per scene: [hook, setup, escalation, climax, ending]
  storyType: string;      // story archetype e.g. "family-secret", "haunted-place"
  location: string;       // primary physical setting e.g. "suburban family home"
  timePeriod: string;     // e.g. "modern day", "early 2000s"
  visualStyle: string;    // e.g. "cinematic realistic drama", "dark atmospheric horror"
  colorMood: string;      // e.g. "muted and melancholic", "cold blue tones"
  weather: string;        // e.g. "overcast", "night rain"
  estimatedDuration: number;
  visualMoments: string[];
  createdAt: string;
}

function deriveScriptId(ideaId: string): string {
  const { genre, date, sequence } = parseId(ideaId);
  return `${AssetType.SCRIPT}-${genre}-${date}-${String(sequence).padStart(3, "0")}`;
}

function buildPrompt(idea: StoryIdea): string {
  return `
You are an expert YouTube Shorts storyteller.

Convert the provided story idea into a highly engaging 60-second narrator-style script
optimized for retention, emotional impact, and visual storytelling.

Requirements:
- Narrator style only. No dialogue unless absolutely necessary.
- Hook viewers within the first 3 seconds. Create curiosity immediately.
- Escalate tension throughout the story.
- Every section must naturally lead into the next.
- The ending must create a strong emotional reaction: surprise, shock, sadness, fear, or awe.
- Easy to understand when heard only once.
- Keep language simple and conversational.
- Each section should contain clear visual moments that become separate video scenes.
- Target duration: 45–60 seconds.

Story Idea:
Title: ${idea.title}
Idea: ${idea.idea}
Hook: ${idea.hook}
Viral Angle: ${idea.viralAngle}

Return ONLY valid JSON:
{
  "hook": "",
  "setup": "",
  "escalation": "",
  "climax": "",
  "ending": "",
  "emotion": "single dominant emotion e.g. sadness, dread, awe, fear, longing, shock",
  "emotionArc": ["hook emotion", "setup emotion", "escalation emotion", "climax emotion", "ending emotion"],
  "storyType": "short hyphenated archetype e.g. family-secret, haunted-place, lost-love, false-reality",
  "location": "primary physical setting e.g. suburban family home, abandoned hospital",
  "timePeriod": "when the story takes place e.g. modern day, early 2000s, 1980s rural America",
  "visualStyle": "cinematic look and feel e.g. cinematic realistic drama, dark atmospheric horror",
  "colorMood": "dominant color palette e.g. muted and melancholic, cold blue tones, warm golden hour",
  "weather": "weather that reflects emotional tone e.g. overcast, night rain, harsh daylight",
  "estimatedDuration": 60,
  "visualMoments": ["", "", "", "", ""]
}
`.trim();
}

export class ScriptGenerator {
  async generate(idea: StoryIdea): Promise<StoryScript> {
    console.log(`📝 Generating script for: ${idea.title}`);

    const parsed = await generateJson<Record<string, unknown>>(buildPrompt(idea));

    const script: StoryScript = {
      id: deriveScriptId(idea.id),
      ideaId: idea.id,
      title: idea.title,
      hook: parsed.hook as string,
      setup: parsed.setup as string,
      escalation: parsed.escalation as string,
      climax: parsed.climax as string,
      ending: parsed.ending as string,
      emotion: (parsed.emotion as string) ?? "",
      emotionArc: (parsed.emotionArc as string[]) ?? [],
      storyType: (parsed.storyType as string) ?? "",
      location: (parsed.location as string) ?? "",
      timePeriod: (parsed.timePeriod as string) ?? "",
      visualStyle: (parsed.visualStyle as string) ?? "",
      colorMood: (parsed.colorMood as string) ?? "",
      weather: (parsed.weather as string) ?? "",
      estimatedDuration: (parsed.estimatedDuration as number) ?? 60,
      visualMoments: (parsed.visualMoments as string[]) ?? [],
      createdAt: now(),
    };

    await storage.save("story/scripts", script.id, script);
    return script;
  }
}
