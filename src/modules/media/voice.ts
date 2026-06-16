import { mkdir } from "fs/promises";
import path from "path";
import wav from "wav";
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { storage } from "../storage";
import { deriveAudioId } from "../id-generator";
import { now } from "../story/base";
import { type StoryScript } from "../story/script";
import { env } from "../../config/env";
import { settingsService } from "../../services/settings.service";

const TTS_MODEL = "gemini-3.1-flash-tts-preview";

// Default voice — overridden at runtime by settings.ttsVoice
const DEFAULT_VOICE_NAME = "Kore";

// Gemini TTS returns raw PCM: mono, 24 kHz, 16-bit signed little-endian
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const MIME_TYPE = "audio/l16";

const AUDIO_DIR = path.join(process.cwd(), "data", "assets", "audio");

// Retry config — TTS has a known ~small% rate of 500 errors and can timeout
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export interface VoiceFile {
  id: string;
  scriptId: string;
  title: string;
  narration: string;
  voice: string;
  audioPath: string;
  duration?: number;     // seconds — populated once we know PCM byte length
  mimeType: string;      // raw format from TTS provider e.g. "audio/l16"
  sampleRate: number;
  channels: number;
  createdAt: string;
}

/**
 * Wraps raw PCM bytes in a proper RIFF/WAV container and writes to disk.
 * Gemini TTS returns raw PCM — this adds the RIFF header + format chunk.
 */
function saveWaveFile(filename: string, pcmData: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(filename, {
      channels: CHANNELS,
      sampleRate: SAMPLE_RATE,
      bitDepth: BIT_DEPTH,
    });

    writer.on("finish", resolve);
    writer.on("error", reject);

    writer.write(pcmData);
    writer.end();
  });
}

export class VoiceGenerator {
  private gemini: GoogleGenAI;

  constructor() {
    // TTS audio generation takes longer than text calls.
    // Default undici timeout is too short — set 120s to avoid UND_ERR_HEADERS_TIMEOUT.
    this.gemini = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      httpOptions: { timeout: 120_000 },
    });
  }

  /**
   * Joins the 5 script sections into a single narration string.
   * Kept private so future changes (pauses, genre pacing) don't touch the public API.
   */
  private buildNarration(script: StoryScript): string {
    return [
      script.hook,
      script.setup,
      script.escalation,
      script.climax,
      script.ending,
    ].join("\n\n");
  }

  /**
   * Builds a structured TTS prompt that steers delivery style from the
   * script's dominant emotion, color mood, and weather.
   */
  private buildTtsPrompt(script: StoryScript, narration: string): string {
    return `
# AUDIO PROFILE: Narrator
## "${script.title}"

### DIRECTOR'S NOTES

Style: ${script.emotion} short-form narrator for YouTube Shorts. Gripping and cinematic.
Keep the listener on edge. Every sentence should make them need to hear the next.

Pacing: Measured but urgent. Pause slightly between sections to let tension breathe.
Never rush — let the weight of each line land before moving on.

Tone: Matches the visual mood — ${script.colorMood}, ${script.weather}.

### TRANSCRIPT

${narration}
`.trim();
  }

  async generate(script: StoryScript): Promise<VoiceFile> {
    console.log(`🎙  Generating voice for: ${script.title}`);

    // Read voice name from settings at runtime so the user can change it
    const settings = await settingsService.read();
    const voiceName = settings.ttsVoice || DEFAULT_VOICE_NAME;

    const id = deriveAudioId(script.id);
    const narration = this.buildNarration(script);
    const prompt = this.buildTtsPrompt(script, narration);

    // Call Gemini TTS — returns raw PCM, not a WAV file
    // Retries on timeout and transient server errors
    let audioData: string | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        console.log(`  ⟳ TTS retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const response: GenerateContentResponse =
          await this.gemini.models.generateContent({
            model: TTS_MODEL,
            contents: prompt,
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName,
                  },
                },
              },
            },
          });

        audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) break;

        // Model returned no data — treat as retryable
        lastError = new Error(`TTS returned no audio data on attempt ${attempt + 1}`);
      } catch (err) {
        lastError = err;
        if (attempt === MAX_RETRIES) break;
      }
    }

    if (!audioData) {
      throw lastError ?? new Error(`TTS returned no audio data for ${id}`);
    }

    // Decode base64 → raw PCM buffer
    const pcmBuffer = Buffer.from(audioData, "base64");

    // PCM duration: bytes / (sampleRate * channels * bytesPerSample)
    const duration = pcmBuffer.byteLength / (SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8));

    // Write a valid WAV file (RIFF header + PCM data) to data/assets/audio/
    await mkdir(AUDIO_DIR, { recursive: true });
    const audioPath = path.join(AUDIO_DIR, `${id}.wav`);
    await saveWaveFile(audioPath, pcmBuffer);

    console.log(`✅ Audio saved: ${audioPath} (${duration.toFixed(1)}s)`);

    const voiceFile: VoiceFile = {
      id,
      scriptId: script.id,
      title: script.title,
      narration,
      voice: voiceName,
      audioPath,
      duration,
      mimeType: MIME_TYPE,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      createdAt: now(),
    };

    // Save JSON metadata to data/media/audio/
    await storage.save("media/audio", id, voiceFile);

    return voiceFile;
  }
}
