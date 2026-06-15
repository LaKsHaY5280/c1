import { storage } from "../storage";
import { deriveMetadataId } from "../id-generator";
import { generateJson, now } from "../story/base";
import { type StoryIdea } from "../story/idea";
import { type StoryScript } from "../story/script";
import { type VideoFile } from "./renderer";

// Hard limits — frozen so downstream tools (youtube.ts, A/B testing) can rely on them
const TITLE_MAX_LENGTH  = 60;
const ALT_TITLE_COUNT   = 10;
const HASHTAG_COUNT     = 5;
const TAG_COUNT         = 10;
const DESCRIPTION_MAX   = 500;
const LANGUAGE          = "en";

// Genre-specific hashtag sets — extend as genres are added
const GENRE_HASHTAGS: Record<string, string[]> = {
  horror:   ["#shorts", "#horror", "#scarystory", "#creepypasta", "#horrorshorts"],
  mystery:  ["#shorts", "#mystery", "#mysterystory", "#unsolved", "#mysteryshorts"],
  scifi:    ["#shorts", "#scifi", "#sciencefiction", "#futuretech", "#scifiShorts"],
  fantasy:  ["#shorts", "#fantasy", "#fantasystory", "#magic", "#fantasyshorts"],
  thriller: ["#shorts", "#thriller", "#thrillerstory", "#suspense", "#thrillerShorts"],
  romance:  ["#shorts", "#romance", "#lovestory", "#romantic", "#romanceshorts"],
  drama:    ["#shorts", "#drama", "#story", "#emotionalstory", "#familydrama"],
};

const FALLBACK_HASHTAGS = ["#shorts", "#story", "#viral", "#shortfilm", "#storytelling"];

export interface MetadataFile {
  id: string;
  scriptId: string;
  videoId: string;
  title: string;                // best title — selected from alternatives
  alternativeTitles: string[];  // all 10 generated titles for A/B testing
  description: string;
  hashtags: string[];           // 5 genre-specific hashtags
  tags: string[];               // 10 YouTube search tags
  category: string;             // YouTube category name
  language: string;             // "en"
  uploadPriority: number;       // 0–100 — higher = publish sooner
  createdAt: string;
}

function buildPrompt(idea: StoryIdea, script: StoryScript): string {
  return `
You are a YouTube Shorts publishing strategist.

Generate publishing metadata for a ${idea.genre.toUpperCase()} short video.

Story context:
{
  "title": "${idea.title}",
  "hook": "${idea.hook}",
  "genre": "${idea.genre}",
  "viralAngle": "${idea.viralAngle}",
  "storyType": "${script.storyType}",
  "emotion": "${script.emotion}"
}

Rules for titles:
- Generate exactly ${ALT_TITLE_COUNT} title options
- Each title must be under ${TITLE_MAX_LENGTH} characters
- High curiosity — make someone stop scrolling
- Emotional — the viewer must feel something immediately
- No lies, no fake clickbait (e.g. "you won't believe" is fine, "I died" is not)
- Mobile-friendly — reads clearly on a small screen
- Do NOT start every title with "I" — vary the structure

Rules for description:
- Maximum ${DESCRIPTION_MAX} characters
- One sentence summary of the story
- One call to action (e.g. "Follow for daily stories.")
- End with the hashtags on a new line

Rules for tags:
- Exactly ${TAG_COUNT} tags
- Mix of broad (e.g. "horror story") and specific (e.g. "baby monitor horror")
- No hashtag symbols — plain words only

Rules for uploadPriority:
- Score 0–100
- Score higher if: hook is strong, viral angle is specific, genre has broad appeal
- Score lower if: concept is generic, hook is weak, niche audience

Return ONLY valid JSON:
{
  "bestTitle": "",
  "alternativeTitles": ["", "", "", "", "", "", "", "", "", ""],
  "description": "",
  "tags": ["", "", "", "", "", "", "", "", "", ""],
  "uploadPriority": 0
}
`.trim();
}

/**
 * Maps genre to YouTube video category name.
 * Category IDs are assigned by youtube.ts at upload time.
 */
function categoryForGenre(genre: string): string {
  const map: Record<string, string> = {
    horror:   "Film & Animation",
    mystery:  "Film & Animation",
    scifi:    "Science & Technology",
    fantasy:  "Film & Animation",
    thriller: "Film & Animation",
    romance:  "Entertainment",
    drama:    "Entertainment",
  };
  return map[genre.toLowerCase()] ?? "Entertainment";
}

export class MetadataGenerator {
  async generate(
    idea: StoryIdea,
    script: StoryScript,
    video: VideoFile,
  ): Promise<MetadataFile> {
    console.log(`🏷  Generating metadata for: ${idea.title}`);

    const id = deriveMetadataId(script.id);

    const parsed = await generateJson<{
      bestTitle: string;
      alternativeTitles: string[];
      description: string;
      tags: string[];
      uploadPriority: number;
    }>(buildPrompt(idea, script));

    // Enforce title length limit — truncate any that exceed it
    const allTitles = [parsed.bestTitle, ...parsed.alternativeTitles]
      .map((t) => t.slice(0, TITLE_MAX_LENGTH).trim())
      .filter(Boolean);

    const bestTitle = allTitles[0] ?? idea.title;
    const alternativeTitles = allTitles.slice(1, ALT_TITLE_COUNT + 1);

    // Enforce description length
    const description = parsed.description.slice(0, DESCRIPTION_MAX).trim();

    // Use genre hashtags — fall back if genre not in map
    const hashtags =
      GENRE_HASHTAGS[idea.genre.toLowerCase()] ?? FALLBACK_HASHTAGS;

    // Enforce tag count
    const tags = parsed.tags.slice(0, TAG_COUNT);

    // Clamp priority to 0–100
    const uploadPriority = Math.max(0, Math.min(100, Math.round(parsed.uploadPriority)));

    const metadataFile: MetadataFile = {
      id,
      scriptId: script.id,
      videoId: video.id,
      title: bestTitle,
      alternativeTitles,
      description,
      hashtags,
      tags,
      category: categoryForGenre(idea.genre),
      language: LANGUAGE,
      uploadPriority,
      createdAt: now(),
    };

    await storage.save("media/metadata", id, metadataFile);

    return metadataFile;
  }
}
