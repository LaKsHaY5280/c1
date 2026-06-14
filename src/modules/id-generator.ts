export enum AssetType {
  IDEA = "IDEA",
  SCRIPT = "SCR",
  SCENE = "SCN",
  CHARACTER = "CHAR",
  VIDEO = "VID",
  AUDIO = "AUD",
  CAPTION = "CAP",
  THUMBNAIL = "THM",
  METADATA = "META",
}

export const GENRE_CODES: Record<string, string> = {
  horror: "HOR",
  mystery: "MYS",
  scifi: "SCI",
  fantasy: "FAN",
  thriller: "THR",
  romance: "ROM",
  drama: "DRM",
};

export function getGenreCode(genre: string): string {
  const value = genre.toLowerCase();

  if (value.includes("horror")) return "HOR";

  if (value.includes("mystery")) return "MYS";

  if (value.includes("scifi") || value.includes("sci-fi") || value.includes("science fiction")) return "SCI";

  if (value.includes("fantasy")) return "FAN";

  if (value.includes("thriller")) return "THR";

  if (value.includes("romance") || value.includes("romantic")) return "ROM";

  if (value.includes("drama")) return "DRM";

  return "GEN";
}

export function generateId(
  type: AssetType,
  genre: string,
  sequence: number,
): string {
  const genreCode = getGenreCode(genre);

  const now = new Date();

  const date =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const seq = String(sequence).padStart(3, "0");

  return `${type}-${genreCode}-${date}-${seq}`;
}

export function parseId(id: string) {
  const [type, genre, date, sequence] = id.split("-");

  return {
    type,
    genre,
    date,
    sequence: Number(sequence),
  };
}

// SCR-DRM-20260614-001 → SCN-DRM-20260614-001  (the scene collection file)
export function deriveSceneFileId(scriptId: string): string {
  const { genre, date, sequence } = parseId(scriptId);
  const seq = String(sequence).padStart(3, "0");
  return `${AssetType.SCENE}-${genre}-${date}-${seq}`;
}

// SCR-DRM-20260614-001 + sceneNumber 2 → SCN-DRM-20260614-001-02
export function deriveSceneId(scriptId: string, sceneNumber: number): string {
  const { genre, date, sequence } = parseId(scriptId);
  const seq = String(sequence).padStart(3, "0");
  const sceneNum = String(sceneNumber).padStart(2, "0");
  return `${AssetType.SCENE}-${genre}-${date}-${seq}-${sceneNum}`;
}

// SCR-DRM-20260614-001 → CHAR-DRM-20260614-001
export function deriveCharacterId(scriptId: string): string {
  const { genre, date, sequence } = parseId(scriptId);
  const seq = String(sequence).padStart(3, "0");
  return `${AssetType.CHARACTER}-${genre}-${date}-${seq}`;
}
