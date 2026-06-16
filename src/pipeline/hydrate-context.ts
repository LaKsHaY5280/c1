/**
 * hydrateContext — rebuilds a PipelineContext from disk for a given run.
 *
 * Called by the single-step retry endpoint so that later steps (render,
 * metadata, upload) receive the prior outputs they depend on, rather than
 * starting with an empty context and immediately throwing.
 *
 * Strategy: each step output's ID is derivable from the scriptId, so we
 * load the script first, then derive all downstream IDs from it.
 *
 * For steps that don't write a persisted file (visualSearch, pexels) we
 * reconstruct enough for the steps that follow them.
 */

import { storage } from "../modules/storage";
import { type PipelineContext } from "./step-registry";
import { type RunRecord } from "./pipeline-context";
import {
  deriveAudioId,
  deriveCaptionId,
  deriveCharacterId,
  deriveSceneFileId,
  deriveVideoId,
  deriveMetadataId,
  deriveThumbnailId,
} from "../modules/id-generator";
import { readFile } from "fs/promises";
import path from "path";
import { createLogger } from "../services/log.service";

import type { StoryIdea } from "../modules/story/idea";
import type { StoryScript } from "../modules/story/script";
import type { StoryCharacterFile } from "../modules/story/character";
import type { StorySceneFile } from "../modules/story/scene";
import type { AssetManifest } from "../modules/media/downloader";
import type { VoiceFile } from "../modules/media/voice";
import type { CaptionFile } from "../modules/media/caption";
import type { VideoFile } from "../modules/media/renderer";
import type { MetadataFile } from "../modules/media/metadata";
import type { ThumbnailFile } from "../modules/media/thumbnail";

/**
 * Load a manifest from the on-disk JSON file (stored in data/assets/, not
 * data/media/).
 */
async function loadManifest(sceneFileId: string): Promise<AssetManifest | null> {
  try {
    const manifestPath = path.join(
      process.cwd(),
      "data",
      "assets",
      `${sceneFileId}.manifest.json`,
    );
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as AssetManifest;
  } catch {
    return null;
  }
}

/**
 * Rebuilds the PipelineContext for an existing run by loading every
 * available artifact from disk.  Fields that haven't been produced yet
 * (or whose files are missing) are left undefined — the step validator
 * will throw a proper error if a required predecessor is absent.
 */
export async function hydrateContext(run: RunRecord): Promise<PipelineContext> {
  const log = createLogger(run.id);
  const ctx: PipelineContext = { log };

  // ── idea ──────────────────────────────────────────────────────────────────
  const ideaStep = run.steps["idea"];
  if (ideaStep?.outputId) {
    ctx.idea = (await storage.load<StoryIdea>("story/ideas", ideaStep.outputId)) ?? undefined;
  }

  // ── script ────────────────────────────────────────────────────────────────
  const scriptStep = run.steps["script"];
  if (scriptStep?.outputId) {
    ctx.script = (await storage.load<StoryScript>("story/scripts", scriptStep.outputId)) ?? undefined;
  }

  // ── characters ────────────────────────────────────────────────────────────
  if (ctx.script) {
    const charId = deriveCharacterId(ctx.script.id);
    ctx.characterFile = (await storage.load<StoryCharacterFile>("story/characters", charId)) ?? undefined;
  } else {
    const charStep = run.steps["characters"];
    if (charStep?.outputId) {
      ctx.characterFile = (await storage.load<StoryCharacterFile>("story/characters", charStep.outputId)) ?? undefined;
    }
  }

  // ── scenes ────────────────────────────────────────────────────────────────
  if (ctx.script) {
    const sceneFileId = deriveSceneFileId(ctx.script.id);
    ctx.sceneFile = (await storage.load<StorySceneFile>("story/scenes", sceneFileId)) ?? undefined;
  } else {
    const sceneStep = run.steps["scenes"];
    if (sceneStep?.outputId) {
      ctx.sceneFile = (await storage.load<StorySceneFile>("story/scenes", sceneStep.outputId)) ?? undefined;
    }
  }

  // ── manifest (stored as .manifest.json alongside asset files) ────────────
  if (ctx.sceneFile) {
    ctx.manifest = (await loadManifest(ctx.sceneFile.id)) ?? undefined;
  }

  // ── voice ─────────────────────────────────────────────────────────────────
  if (ctx.script) {
    const audioId = deriveAudioId(ctx.script.id);
    ctx.voiceFile = (await storage.load<VoiceFile>("media/audio", audioId)) ?? undefined;
  } else {
    const voiceStep = run.steps["voice"];
    if (voiceStep?.outputId) {
      ctx.voiceFile = (await storage.load<VoiceFile>("media/audio", voiceStep.outputId)) ?? undefined;
    }
  }

  // ── captions ──────────────────────────────────────────────────────────────
  if (ctx.script) {
    const captionId = deriveCaptionId(ctx.script.id);
    ctx.captionFile = (await storage.load<CaptionFile>("media/captions", captionId)) ?? undefined;
  } else {
    const captionStep = run.steps["captions"];
    if (captionStep?.outputId) {
      ctx.captionFile = (await storage.load<CaptionFile>("media/captions", captionStep.outputId)) ?? undefined;
    }
  }

  // ── video ─────────────────────────────────────────────────────────────────
  if (ctx.script) {
    const videoId = deriveVideoId(ctx.script.id);
    ctx.videoFile = (await storage.load<VideoFile>("media/videos", videoId)) ?? undefined;
  } else {
    const renderStep = run.steps["render"];
    if (renderStep?.outputId) {
      ctx.videoFile = (await storage.load<VideoFile>("media/videos", renderStep.outputId)) ?? undefined;
    }
  }

  // ── metadata ──────────────────────────────────────────────────────────────
  if (ctx.script) {
    const metaId = deriveMetadataId(ctx.script.id);
    ctx.metadataFile = (await storage.load<MetadataFile>("media/metadata", metaId)) ?? undefined;
  } else {
    const metaStep = run.steps["metadata"];
    if (metaStep?.outputId) {
      ctx.metadataFile = (await storage.load<MetadataFile>("media/metadata", metaStep.outputId)) ?? undefined;
    }
  }

  // ── thumbnail ─────────────────────────────────────────────────────────────
  if (ctx.script) {
    const thumbnailId = deriveThumbnailId(ctx.script.id);
    ctx.thumbnailFile = (await storage.load<ThumbnailFile>("media/thumbnails", thumbnailId)) ?? undefined;
  } else {
    const thumbnailStep = run.steps["thumbnail"];
    if (thumbnailStep?.outputId) {
      ctx.thumbnailFile = (await storage.load<ThumbnailFile>("media/thumbnails", thumbnailStep.outputId)) ?? undefined;
    }
  }

  log.info(
    `Context hydrated — idea:${ctx.idea ? "✓" : "✗"} script:${ctx.script ? "✓" : "✗"} ` +
    `chars:${ctx.characterFile ? "✓" : "✗"} scenes:${ctx.sceneFile ? "✓" : "✗"} ` +
    `manifest:${ctx.manifest ? "✓" : "✗"} voice:${ctx.voiceFile ? "✓" : "✗"} ` +
    `captions:${ctx.captionFile ? "✓" : "✗"} video:${ctx.videoFile ? "✓" : "✗"} ` +
    `metadata:${ctx.metadataFile ? "✓" : "✗"} thumbnail:${ctx.thumbnailFile ? "✓" : "✗"}`,
  );

  return ctx;
}
