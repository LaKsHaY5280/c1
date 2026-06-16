import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { storage } from "../storage";
import { deriveCaptionId } from "../id-generator";
import { generateJson, now } from "../story/base";
import { type VoiceFile } from "./voice";
import { settingsService } from "../../services/settings.service";

const CAPTION_DIR = path.join(process.cwd(), "data", "assets", "captions");

export interface CaptionSegment {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface CaptionFile {
  id: string;
  scriptId: string;
  audioId: string;
  title: string;
  segments: CaptionSegment[];
  srtPath: string;
  createdAt: string;
}

function buildPrompt(narration: string, duration: number, maxWords: number): string {
  return `
Split this narration into short caption segments for a YouTube Shorts video.

Rules:
- 3 to ${maxWords} words per segment
- Maximum 2 lines on screen at once
- Dramatic pacing — match the emotional rhythm of the text
- Assign timestamps that span the full ${duration.toFixed(1)} seconds
- First segment starts at 0, last segment ends at ${duration.toFixed(1)}
- No segment should be longer than 4 seconds
- Timestamps must be sequential and non-overlapping

Narration:
${narration}

Return ONLY valid JSON — an array of segment objects:
[
  { "text": "...", "start": 0, "end": 2.5 }
]
`.trim();
}

/**
 * Converts caption segments to SRT format.
 * No AI involved — pure timestamp arithmetic.
 */
function toSrt(segments: CaptionSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = formatSrtTime(seg.start);
      const end = formatSrtTime(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join("\n\n");
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":") + "," + String(ms).padStart(3, "0");
}

export class CaptionGenerator {
  async generate(voiceFile: VoiceFile): Promise<CaptionFile> {
    console.log(`📝 Generating captions for: ${voiceFile.title}`);

    const settings = await settingsService.read();
    const maxWords = settings.captionMaxWordsPerSegment ?? 8;

    const duration = voiceFile.duration ?? 60;
    const id = deriveCaptionId(voiceFile.scriptId);

    const segments = await generateJson<CaptionSegment[]>(
      buildPrompt(voiceFile.narration, duration, maxWords),
    );

    // Write SRT file
    await mkdir(CAPTION_DIR, { recursive: true });
    const srtPath = path.join(CAPTION_DIR, `${id}.srt`);
    await writeFile(srtPath, toSrt(segments), "utf-8");

    console.log(`✅ Captions saved: ${srtPath} (${segments.length} segments)`);

    const captionFile: CaptionFile = {
      id,
      scriptId: voiceFile.scriptId,
      audioId: voiceFile.id,
      title: voiceFile.title,
      segments,
      srtPath,
      createdAt: now(),
    };

    await storage.save("media/captions", id, captionFile);

    return captionFile;
  }
}
