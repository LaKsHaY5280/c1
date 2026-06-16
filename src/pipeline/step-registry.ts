/**
 * Step registry — the only file that knows which module maps to which step name.
 *
 * Each step function receives the shared PipelineContext and mutates it
 * as assets are created, so later steps can access the outputs of earlier ones.
 *
 * runPipeline() iterates STEP_ORDER and calls each entry here.
 * runStep(stepName, ...) looks up by key for single-step retry.
 */

import { IdeaGenerator } from "../modules/story/idea";
import { ScriptGenerator } from "../modules/story/script";
import { CharacterGenerator } from "../modules/story/character";
import { SceneGenerator } from "../modules/story/scene";
import { VisualSearchGenerator } from "../modules/media/visual-search";
import { pexels } from "../modules/media/pexels";
import { downloader, type AssetManifest } from "../modules/media/downloader";
import { VoiceGenerator } from "../modules/media/voice";
import { CaptionGenerator } from "../modules/media/caption";
import { Renderer } from "../modules/media/renderer";
import { MetadataGenerator } from "../modules/media/metadata";
import { publishVideo } from "../modules/youtube/youtube";
import { settingsService } from "../services/settings.service";

import { type StepName } from "./pipeline-context";
import { type Logger } from "../services/log.service";

import type { StoryIdea } from "../modules/story/idea";
import type { StoryScript } from "../modules/story/script";
import type { StoryCharacterFile } from "../modules/story/character";
import type { StorySceneFile } from "../modules/story/scene";
import type { VoiceFile } from "../modules/media/voice";
import type { CaptionFile } from "../modules/media/caption";
import type { VideoFile } from "../modules/media/renderer";
import type { MetadataFile } from "../modules/media/metadata";

// Shared context passed between steps — built up as the pipeline runs
export interface PipelineContext {
  log: Logger;
  idea?: StoryIdea;
  script?: StoryScript;
  characterFile?: StoryCharacterFile;
  sceneFile?: StorySceneFile;
  manifest?: AssetManifest;
  voiceFile?: VoiceFile;
  captionFile?: CaptionFile;
  videoFile?: VideoFile;
  metadataFile?: MetadataFile;
}

// Step function type — returns the outputId string if one was created
export type StepFn = (ctx: PipelineContext) => Promise<string | undefined>;

export const STEP_REGISTRY: Record<StepName, StepFn> = {
  idea: async (ctx) => {
    ctx.idea = await new IdeaGenerator().generate();
    ctx.log.info(`[${ctx.idea.genre.toUpperCase()}] ${ctx.idea.title}`);
    return ctx.idea.id;
  },

  script: async (ctx) => {
    if (!ctx.idea) throw new Error("idea missing from context");
    ctx.script = await new ScriptGenerator().generate(ctx.idea);
    ctx.log.info(`Script: ${ctx.script.id} | ~${ctx.script.estimatedDuration}s | ${ctx.script.emotion}`);
    return ctx.script.id;
  },

  characters: async (ctx) => {
    if (!ctx.script) throw new Error("script missing from context");
    ctx.characterFile = await new CharacterGenerator().generate(ctx.script);
    const names = ctx.characterFile.characters.map((c) => c.name).join(", ");
    ctx.log.info(`Characters: ${names}`);
    return ctx.characterFile.id;
  },

  scenes: async (ctx) => {
    if (!ctx.script || !ctx.characterFile) throw new Error("script or characters missing");
    ctx.sceneFile = await new SceneGenerator().generate(ctx.script, ctx.characterFile.characters);
    ctx.log.info(`Scenes: ${ctx.sceneFile.scenes.length} scenes generated`);
    return ctx.sceneFile.id;
  },

  visualSearch: async (ctx) => {
    if (!ctx.sceneFile) throw new Error("sceneFile missing from context");
    const queries = await new VisualSearchGenerator().generate(ctx.sceneFile.scenes);
    // Store queries on context as a transient value — no file output
    (ctx as PipelineContext & { queries: typeof queries }).queries = queries;
    ctx.log.info(`Visual search: ${queries.length} queries generated`);
    return undefined;
  },

  pexels: async (ctx) => {
    if (!ctx.sceneFile) throw new Error("sceneFile missing from context");
    const queries = (ctx as PipelineContext & { queries: ReturnType<VisualSearchGenerator["generate"]> extends Promise<infer T> ? T : never }).queries;
    if (!queries) throw new Error("visual search queries missing from context");

    const sceneById = new Map(ctx.sceneFile.scenes.map((s) => [s.id, s]));
    const downloadedAssets = [];

    for (const q of queries) {
      const scene = sceneById.get(q.sceneId);
      if (!scene) { ctx.log.warn(`Scene not found for query "${q.query}" — skipping`); continue; }

      ctx.log.info(`Searching (${scene.preferredMediaType}): "${q.query}"`);

      if (scene.preferredMediaType === "video") {
        const videos = await pexels.searchVideos(q.query, 5);
        if (!videos.length || !videos[0]?.videoUrl) { ctx.log.warn(`No video results for "${q.query}" — skipping`); continue; }
        const best = videos[0];
        downloadedAssets.push(await downloader.download({
          sceneId: q.sceneId, url: best.videoUrl, ext: "mp4",
          mediaType: "video", pexelsId: best.id, credit: best.videographer, pexelsUrl: best.url,
        }));
      } else {
        const photos = await pexels.searchPhotos(q.query, 5);
        if (!photos.length) { ctx.log.warn(`No photo results for "${q.query}" — skipping`); continue; }
        const best = photos[0];
        downloadedAssets.push(await downloader.download({
          sceneId: q.sceneId, url: best.imageUrl, ext: "jpg",
          mediaType: "photo", pexelsId: best.id, credit: best.photographer, pexelsUrl: best.url,
        }));
      }
    }

    // Store downloaded assets for the manifest step
    (ctx as any).downloadedAssets = downloadedAssets;
    ctx.log.info(`Downloaded ${downloadedAssets.length} assets`);
    return undefined;
  },

  manifest: async (ctx) => {
    if (!ctx.sceneFile) throw new Error("sceneFile missing from context");
    const downloadedAssets = (ctx as any).downloadedAssets ?? [];
    await downloader.saveManifest(ctx.sceneFile.id, downloadedAssets);

    ctx.manifest = {
      runId: ctx.sceneFile.id,
      assets: downloadedAssets,
      createdAt: new Date().toISOString(),
    };

    ctx.log.info(`Manifest saved: ${downloadedAssets.length} assets recorded`);
    return undefined;
  },

  voice: async (ctx) => {
    if (!ctx.script) throw new Error("script missing from context");
    ctx.voiceFile = await new VoiceGenerator().generate(ctx.script);
    ctx.log.info(`Voice: ${ctx.voiceFile.id} (${ctx.voiceFile.duration?.toFixed(1)}s)`);
    return ctx.voiceFile.id;
  },

  captions: async (ctx) => {
    if (!ctx.voiceFile) throw new Error("voiceFile missing from context");
    ctx.captionFile = await new CaptionGenerator().generate(ctx.voiceFile);
    ctx.log.info(`Captions: ${ctx.captionFile.segments.length} segments`);
    return ctx.captionFile.id;
  },

  render: async (ctx) => {
    if (!ctx.sceneFile || !ctx.manifest || !ctx.voiceFile || !ctx.captionFile) {
      throw new Error("render is missing required context (scenes, manifest, voice, captions)");
    }
    const sceneMap = new Map(ctx.sceneFile.scenes.map((s) => [s.id, s.duration]));
    ctx.videoFile = await new Renderer().render(ctx.manifest, sceneMap, ctx.voiceFile, ctx.captionFile);
    ctx.log.info(`Rendered: ${ctx.videoFile.videoPath}`);
    return ctx.videoFile.id;
  },

  metadata: async (ctx) => {
    if (!ctx.idea || !ctx.script || !ctx.videoFile) {
      throw new Error("metadata is missing required context (idea, script, video)");
    }
    ctx.metadataFile = await new MetadataGenerator().generate(ctx.idea, ctx.script, ctx.videoFile);
    ctx.log.info(`Metadata: "${ctx.metadataFile.title}" (priority: ${ctx.metadataFile.uploadPriority})`);
    return ctx.metadataFile.id;
  },

  upload: async (ctx) => {
    if (!ctx.videoFile || !ctx.metadataFile) {
      throw new Error("upload is missing required context (video, metadata)");
    }
    const settings = await settingsService.read();
    const visibility = settings.defaultVisibility ?? "private";
    const uploadFile = await publishVideo(ctx.videoFile, ctx.metadataFile, visibility);
    ctx.log.info(`Uploaded: ${uploadFile.url}`);
    return uploadFile.id;
  },
};
