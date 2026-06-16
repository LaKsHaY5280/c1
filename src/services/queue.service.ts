/**
 * Queue service — CRUD for QueueItem records in data/queue/.
 *
 * A QueueItem is a planned content job. It is NOT the same as a Run.
 * One QueueItem may eventually produce one Run when its scheduledFor
 * time arrives and the scheduler picks it up.
 *
 * ID format:  QUEUE-YYYYMMDD-NNN
 */

import fs from "fs/promises";
import path from "path";
import { AssetType, generateTypedId } from "../modules/id-generator";

const QUEUE_DIR = path.join(process.cwd(), "data", "queue");

export type QueueStatus =
  | "pending"      // created, not yet due
  | "queued"       // due — scheduler has picked it up
  | "generating"   // pipeline is running
  | "generated"    // pipeline completed, not yet uploaded
  | "uploaded"     // successfully uploaded
  | "failed"       // pipeline or upload failed
  | "skipped";     // manually skipped

export interface QueueItem {
  id: string;            // QUEUE-YYYYMMDD-NNN
  genre: string;         // horror / mystery / scifi / …
  scheduledFor: string;  // ISO datetime — when this item should be generated
  status: QueueStatus;
  runId?: string;        // RUN-* — set once generation starts
  videoId?: string;      // VID-* — set once render completes
  thumbnailId?: string;  // THM-* — set once thumbnail generates
  metadataId?: string;   // META-* — set once metadata generates
  notes?: string;        // free-text notes
  createdAt: string;
  updatedAt: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
}

async function getNextSequence(): Promise<number> {
  await ensureDir();
  const files = await fs.readdir(QUEUE_DIR);
  return files.filter((f) => f.endsWith(".json")).length + 1;
}

async function save(item: QueueItem): Promise<void> {
  await ensureDir();
  const filePath = path.join(QUEUE_DIR, `${item.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(item, null, 2), "utf-8");
}

async function load(id: string): Promise<QueueItem | null> {
  try {
    const filePath = path.join(QUEUE_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as QueueItem;
  } catch {
    return null;
  }
}

async function list(): Promise<QueueItem[]> {
  await ensureDir();
  const files = await fs.readdir(QUEUE_DIR);
  const items: QueueItem[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const content = await fs.readFile(path.join(QUEUE_DIR, file), "utf-8");
    items.push(JSON.parse(content) as QueueItem);
  }
  // Newest scheduledFor first
  return items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

async function create(genre: string, scheduledFor: string, notes?: string): Promise<QueueItem> {
  const seq = await getNextSequence();
  const id = generateTypedId(AssetType.QUEUE, seq);
  const ts = new Date().toISOString();

  const item: QueueItem = {
    id,
    genre,
    scheduledFor,
    status: "pending",
    notes,
    createdAt: ts,
    updatedAt: ts,
  };

  await save(item);
  return item;
}

async function update(id: string, patch: Partial<Omit<QueueItem, "id" | "createdAt">>): Promise<QueueItem | null> {
  const item = await load(id);
  if (!item) return null;

  const updated: QueueItem = {
    ...item,
    ...patch,
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await save(updated);
  return updated;
}

async function remove(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(QUEUE_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns all items that are due (scheduledFor <= now) and still pending.
 * The scheduler calls this to decide what to trigger next.
 */
async function getDueItems(): Promise<QueueItem[]> {
  const all = await list();
  const now = new Date().toISOString();
  return all.filter((item) => item.status === "pending" && item.scheduledFor <= now);
}

/**
 * Returns the next pending item regardless of whether it's due yet.
 * Used by POST /scheduler/next for manual triggering.
 */
async function getNextPending(): Promise<QueueItem | null> {
  const all = await list();
  return all.find((item) => item.status === "pending") ?? null;
}

export const queueService = {
  create,
  load,
  list,
  update,
  remove,
  getDueItems,
  getNextPending,
};
