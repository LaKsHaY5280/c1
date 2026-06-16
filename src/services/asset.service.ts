import fs from "fs/promises";
import path from "path";
import { storage } from "../modules/storage";

/**
 * Thin wrapper around the storage module that the API routes can call
 * without importing individual modules directly.
 */

async function listCollection<T>(collection: string): Promise<T[]> {
  const files = await storage.list(collection);
  const records: T[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const id = file.replace(".json", "");
    const record = await storage.load<T>(collection, id);
    if (record) records.push(record);
  }
  return records;
}

async function listIdeas() {
  return listCollection("story/ideas");
}

async function listScripts() {
  return listCollection("story/scripts");
}

async function listCharacters() {
  return listCollection("story/characters");
}

async function listScenes() {
  return listCollection("story/scenes");
}

async function listAudio() {
  return listCollection("media/audio");
}

async function listCaptions() {
  return listCollection("media/captions");
}

async function listVideos() {
  return listCollection("media/videos");
}

async function listUploads() {
  return listCollection("media/uploads");
}

async function listMetadata() {
  return listCollection("media/metadata");
}

async function listThumbnails() {
  return listCollection("media/thumbnails");
}

async function listAssetFiles(): Promise<string[]> {
  const assetsDir = path.join(process.cwd(), "data", "assets");
  try {
    const files = await fs.readdir(assetsDir);
    return files.filter((f) => f.endsWith(".jpg") || f.endsWith(".mp4"));
  } catch {
    return [];
  }
}

export const assetService = {
  listIdeas,
  listScripts,
  listCharacters,
  listScenes,
  listAudio,
  listCaptions,
  listVideos,
  listUploads,
  listMetadata,
  listThumbnails,
  listAssetFiles,
};
