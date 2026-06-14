import { gemini } from "../../services/gemini.service";
import { storage } from "../storage";
import { AssetType, generateId } from "../id-generator";

export interface StoryIdea {
  id: string;
  title: string;
  idea: string;
  hook: string;
  genre: string; // set by schedule, not by AI
  targetAudience: string;
  viralAngle: string;
  createdAt: string;
}

// Day index 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const DAY_SCHEDULE: Record<number, string> = {
  0: "drama",
  1: "horror",
  2: "mystery",
  3: "scifi",
  4: "fantasy",
  5: "thriller",
  6: "romance",
};

const GENRE_PROMPTS: Record<string, string> = {
  horror: `
You are a viral YouTube Shorts content strategist specializing in HORROR.

Generate ONE horror story idea engineered to go viral on YouTube Shorts and TikTok.

Viral horror hooks that work:
- "You will NEVER look at [everyday object] the same way again"
- A relatable situation that turns deeply wrong in the last 5 seconds
- Childhood fears weaponized — dolls, basements, closets, mirrors
- "Based on true events" energy even if fictional
- The viewer feels personally targeted or watched
- Ends with an unresolved dread — no closure, just escalating fear
- A twist that recontextualizes everything the viewer just watched

Requirements:
- Fits in 60 seconds of narration
- Opens with an immediate hook (first 3 seconds must grab)
- One clear, simple supernatural or psychological threat
- Ends on maximum dread — no happy ending

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  mystery: `
You are a viral YouTube Shorts content strategist specializing in MYSTERY.

Generate ONE mystery story idea engineered to go viral on YouTube Shorts and TikTok.

Viral mystery hooks that work:
- A puzzle the viewer actively wants to solve in comments ("pause and look at the background")
- "I found something in my [house/phone/old photos] and I need answers"
- An unexplained detail that makes people rewatch
- A real-world conspiracy feeling — secret rooms, hidden messages, coded patterns
- A mystery that feels personally solvable — the viewer thinks THEY could crack it
- Ends with a partial answer that raises a bigger question, making them wait for part 2

Requirements:
- Fits in 60 seconds
- Must have one specific mysterious detail that drives the whole story
- Viewer feels like an active investigator, not a passive listener
- Ends with a cliffhanger or unsolved element that demands a follow-up video

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  scifi: `
You are a viral YouTube Shorts content strategist specializing in SCIENCE FICTION.

Generate ONE sci-fi story idea engineered to go viral on YouTube Shorts and TikTok.

Viral sci-fi hooks that work:
- A near-future scenario that feels 10 years away, not 1000 — relatable dread
- "What if your [phone/GPS/AI assistant] was actually doing THIS"
- A mind-bending concept explained so simply a 12-year-old gets it in 60 seconds
- Reality is not what it seems — simulation theory, time loops, parallel lives
- Technology turns on humans in a way nobody saw coming
- Ends with a revelation that makes the viewer question their own reality right now

Requirements:
- Fits in 60 seconds
- The sci-fi concept must be graspable immediately — no complex worldbuilding
- Should make the viewer uncomfortable about something in their real life
- Strong visual potential for AI-generated scenes

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  fantasy: `
You are a viral YouTube Shorts content strategist specializing in FANTASY.

Generate ONE fantasy story idea engineered to go viral on YouTube Shorts and TikTok.

Viral fantasy hooks that work:
- A "chosen one" who turns out to be the villain — subverted expectations
- A magical world rule that has a devastating logical consequence nobody considered
- "What if magic was real but only worked like THIS" — a specific interesting limitation
- A fairy tale retold from the monster's perspective
- A magical gift that is secretly a curse in a clever non-obvious way
- Visually stunning — a single image description that makes viewers stop scrolling

Requirements:
- Fits in 60 seconds
- Must have one original twist on a familiar fantasy concept
- The fantasy element should feel fresh, not a standard dragon/wizard cliché
- Should end with an emotional gut-punch or a wonder-inducing revelation

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  thriller: `
You are a viral YouTube Shorts content strategist specializing in THRILLER.

Generate ONE thriller story idea engineered to go viral on YouTube Shorts and TikTok.

Viral thriller hooks that work:
- High stakes established in the first sentence — life or death, right now
- "I only had 60 seconds to decide" — time pressure maps perfectly to the video format
- A protagonist who realizes too late they've been manipulated the whole time
- An ordinary person trapped in an extraordinary dangerous situation
- The threat feels like it could happen to anyone watching
- A twist villain — the person helping is actually the danger

Requirements:
- Fits in 60 seconds
- Tension must escalate every 10 seconds — no dead moments
- The threat must feel immediate and real, not distant
- Ends at peak tension or with a devastating reveal

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  romance: `
You are a viral YouTube Shorts content strategist specializing in ROMANCE.

Generate ONE romance story idea engineered to go viral on YouTube Shorts and TikTok.

Viral romance hooks that work:
- A love story with a single specific detail that makes it feel real, not movie-perfect
- "She/He never knew I was the one who—" — secret devotion revealed
- Enemies to lovers compressed into 60 seconds with a satisfying payoff
- A missed connection with a twist that makes it bittersweet
- A love that exists in an impossible situation — makes the viewer feel the ache
- Ends with a moment so emotionally precise that people share it saying "this is us"

Requirements:
- Fits in 60 seconds
- Must have one specific emotional detail that feels human and real, not generic
- The romantic payoff must land in the last 10 seconds
- Should make the viewer either smile, tear up, or feel a pang of longing

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,

  drama: `
You are a viral YouTube Shorts content strategist specializing in DRAMA.

Generate ONE drama story idea engineered to go viral on YouTube Shorts and TikTok.

Viral drama hooks that work:
- A single devastating sentence that reframes an entire relationship
- A family secret revealed at the worst possible moment
- "I forgave them. Then I found out the truth." — betrayal with a twist
- A moral dilemma with no clean answer — forces viewers to pick a side in comments
- A quiet moment of sacrifice that hits harder than any explosion
- A character who was right all along but it doesn't feel like a victory

Requirements:
- Fits in 60 seconds
- Must center on a single raw human emotion — grief, betrayal, regret, sacrifice
- No genre trappings — feels like something that could happen to a real person
- Ends with an emotional reversal or a moment of painful clarity

Return JSON only:
{
  "title": "",
  "idea": "",
  "hook": "the opening line spoken in the video",
  "targetAudience": "",
  "viralAngle": "why this specific idea will get shared and commented on"
}
`,
};

export function getTodaysGenre(): string {
  const dayIndex = new Date().getDay();
  return DAY_SCHEDULE[dayIndex];
}

export class IdeaGenerator {
  async generate(genreOverride?: string): Promise<StoryIdea> {
    const genre = genreOverride ?? getTodaysGenre();
    const prompt = GENRE_PROMPTS[genre];

    if (!prompt) {
      throw new Error(`No prompt found for genre: ${genre}`);
    }

    console.log(`🎬 Today's genre: ${genre.toUpperCase()}`);

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);

    const sequence = await storage.getNextSequence("story/ideas");
    const id = generateId(AssetType.IDEA, genre, sequence);

    const storyIdea: StoryIdea = {
      id,
      title: parsed.title,
      idea: parsed.idea,
      hook: parsed.hook,
      genre,
      targetAudience: parsed.targetAudience,
      viralAngle: parsed.viralAngle,
      createdAt: new Date().toISOString(),
    };

    await storage.save("story/ideas", storyIdea.id, storyIdea);

    return storyIdea;
  }
}
