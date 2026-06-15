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
You are a YouTube Shorts script writer. Your scripts are spoken aloud by a narrator.
The video is 45–55 seconds long. Every word costs screen time. Cut ruthlessly.

HARD RULES — violating any of these will break the video:
- Each section (hook, setup, escalation, climax, ending) must be 1–3 sentences MAX
- Each sentence must be short — 10 words or fewer when possible, 15 absolute maximum
- No filler phrases: "little did they know", "suddenly", "as if", "it seemed like"
- No describing emotions — show the action, let the viewer feel it
- No repeating the same tension beat twice — every sentence must advance the story
- The hook must work as a standalone line that stops someone mid-scroll
- The ending must land in ONE sentence — a twist, a reveal, or a gut-punch

PACING MODEL — read this aloud and time it:
hook:        5–8 seconds   (1–2 sentences)
setup:       8–12 seconds  (2–3 sentences)
escalation:  10–12 seconds (2–3 sentences)
climax:      8–10 seconds  (1–2 sentences)
ending:      5–8 seconds   (1 sentence)
total:       ~45–50 seconds

BAD example (too long, too even):
"She opened the door slowly and stepped inside the dark room.
The air was cold and smelled like something old and forgotten.
She looked around, feeling deeply unsettled by what she saw."

GOOD example (tight, punchy, visual):
"She opened the door. The room was wrong.
Everything was exactly how she'd left it — except the chair faced the wall."

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
  "estimatedDuration": 50,
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
