import fs from "fs/promises";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "config", "settings.json");

export interface Settings {
  defaultVisibility: "private" | "unlisted" | "public";
  ttsVoice: string;
  captionMaxWordsPerSegment: number;
  genreSchedule: Record<string, string>;
  autoPublish: boolean;
  schedulerEnabled: boolean;  // whether the scheduler auto-starts on server boot
}

const DEFAULTS: Settings = {
  defaultVisibility: "private",
  ttsVoice: "Kore",
  captionMaxWordsPerSegment: 8,
  genreSchedule: {
    "0": "drama",
    "1": "horror",
    "2": "mystery",
    "3": "scifi",
    "4": "fantasy",
    "5": "thriller",
    "6": "romance",
  },
  autoPublish: false,
  schedulerEnabled: true,  // on by default — toggle off in settings to pause
};

async function read(): Promise<Settings> {
  try {
    const content = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(content) };
  } catch {
    // File doesn't exist yet — return defaults
    return { ...DEFAULTS };
  }
}

async function write(settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

async function update(partial: Partial<Settings>): Promise<Settings> {
  const current = await read();
  const updated = { ...current, ...partial };
  await write(updated);
  return updated;
}

export const settingsService = { read, write, update };
