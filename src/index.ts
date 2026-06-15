import { IdeaGenerator } from "./modules/story/idea";
import { ScriptGenerator } from "./modules/story/script";
import { CharacterGenerator } from "./modules/story/character";
import { SceneGenerator } from "./modules/story/scene";
import { VisualSearchGenerator } from "./modules/media/visual-search";
import { pexels } from "./modules/media/pexels";
import { downloader, type AssetManifest } from "./modules/media/downloader";
import { VoiceGenerator } from "./modules/media/voice";
import { CaptionGenerator } from "./modules/media/caption";
import { Renderer } from "./modules/media/renderer";
import { MetadataGenerator } from "./modules/media/metadata";
import { publishVideo } from "./modules/youtube/youtube";

async function bootstrap() {
  console.log("🚀 Started");
  console.log(`📅 Day: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}`);

  // Step 1: Idea
  const idea = await new IdeaGenerator().generate();

  console.log("\n─────────────────────────────────────────");
  console.log(`🎬 [${idea.genre.toUpperCase()}] ${idea.title}`);
  console.log(`🆔 ${idea.id}`);
  console.log(`\n🪝 Hook:\n   "${idea.hook}"`);
  console.log(`\n💡 Idea:\n   ${idea.idea}`);
  console.log(`\n🚀 Viral Angle:\n   ${idea.viralAngle}`);
  console.log(`\n👥 Target Audience: ${idea.targetAudience}`);

  // Step 2: Script
  const script = await new ScriptGenerator().generate(idea);

  console.log("\n─────────────────────────────────────────");
  console.log(`📄 Script: ${script.id}`);
  console.log(`⏱  ~${script.estimatedDuration}s  |  🎭 ${script.emotion}  |  📂 ${script.storyType}`);
  console.log(`🌊 Emotion Arc: ${script.emotionArc.join(" → ")}`);
  console.log(`📍 ${script.location}  |  🕰  ${script.timePeriod}`);
  console.log(`🎨 ${script.visualStyle}  |  🎞  ${script.colorMood}  |  🌤  ${script.weather}`);
  console.log(`\n🪝 ${script.hook}`);
  console.log(`📖 ${script.setup}`);
  console.log(`📈 ${script.escalation}`);
  console.log(`💥 ${script.climax}`);
  console.log(`🎯 ${script.ending}`);

  // Step 3: Characters
  const characterFile = await new CharacterGenerator().generate(script);

  console.log("\n─────────────────────────────────────────");
  console.log(`👤 Characters: ${characterFile.id}`);
  for (const c of characterFile.characters) {
    console.log(`\n  [${c.role}] ${c.name}, ${c.age} (${c.gender})`);
    console.log(`  👁  ${c.appearance}`);
    console.log(`  👗 ${c.clothing}`);
    console.log(`  💭 ${c.emotionProfile}`);
  }

  // Step 4: Scenes
  const sceneFile = await new SceneGenerator().generate(script, characterFile.characters);

  console.log("\n─────────────────────────────────────────");
  console.log(`🎥 Scenes: ${sceneFile.id}`);
  for (const scene of sceneFile.scenes) {
    console.log(`\n  [${scene.sceneNumber}] ${scene.purpose.toUpperCase()} — ${scene.duration}s — ${scene.emotion}`);
    console.log(`  🆔 ${scene.id}`);
    console.log(`  🎞  ${scene.preferredMediaType}`);
    console.log(`  📷 ${scene.description}`);
  }

  // Step 5: Visual Search Queries
  const queries = await new VisualSearchGenerator().generate(sceneFile.scenes);

  console.log("\n─────────────────────────────────────────");
  console.log(`🔍 Search Queries`);
  for (const q of queries) {
    console.log(`\n  [${q.sceneNumber}] ${q.purpose.toUpperCase()}`);
    console.log(`  🔎 "${q.query}"`);
  }

  // Step 6: Pexels Search + Download
  console.log("\n─────────────────────────────────────────");
  console.log(`📦 Fetching assets from Pexels`);

  const sceneById = new Map(sceneFile.scenes.map((scene) => [scene.id, scene]));
  const downloadedAssets = [];

  for (const q of queries) {
    const scene = sceneById.get(q.sceneId);
    if (!scene) {
      console.log(`  ⚠️  Scene not found for query "${q.query}" — skipping`);
      continue;
    }

    console.log(`\n  Searching (${scene.preferredMediaType}): "${q.query}"`);

    if (scene.preferredMediaType === "video") {
      const videos = await pexels.searchVideos(q.query, 5);

      if (videos.length === 0 || !videos[0]?.videoUrl) {
        console.log(`  ⚠️  No usable video results for "${q.query}" — skipping`);
        continue;
      }

      const best = videos[0];
      console.log(`  🎬 ${best.videographer} — ${best.url}`);

      const downloaded = await downloader.download({
        sceneId: q.sceneId,
        url: best.videoUrl,
        ext: "mp4",
        mediaType: "video",
        pexelsId: best.id,
        credit: best.videographer,
        pexelsUrl: best.url,
      });

      downloadedAssets.push(downloaded);
      continue;
    }

    const photos = await pexels.searchPhotos(q.query, 5);

    if (photos.length === 0) {
      console.log(`  ⚠️  No photo results for "${q.query}" — skipping`);
      continue;
    }

    const best = photos[0];
    console.log(`  📸 ${best.photographer} — ${best.url}`);

    const downloaded = await downloader.download({
      sceneId: q.sceneId,
      url: best.imageUrl,
      ext: "jpg",
      mediaType: "photo",
      pexelsId: best.id,
      credit: best.photographer,
      pexelsUrl: best.url,
    });

    downloadedAssets.push(downloaded);
  }

  await downloader.saveManifest(sceneFile.id, downloadedAssets);

  // Build manifest object in-memory — same shape as what's written to disk
  const manifest: AssetManifest = {
    runId: sceneFile.id,
    assets: downloadedAssets,
    createdAt: new Date().toISOString(),
  };

  // sceneId → duration map for the renderer
  const sceneMap = new Map(sceneFile.scenes.map((s) => [s.id, s.duration]));

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Assets saved to data/assets/`);

  // Step 9: Voice
  const voiceFile = await new VoiceGenerator().generate(script);

  console.log("\n─────────────────────────────────────────");
  console.log(`🎙  Voice: ${voiceFile.id}`);
  console.log(`🔊 Voice: ${voiceFile.voice}`);
  console.log(`📁 Audio: ${voiceFile.audioPath}`);
  console.log(`\n📝 Narration:\n${voiceFile.narration.split("\n\n").map((s, i) => `   [${i + 1}] ${s}`).join("\n")}`);

  // Step 10: Captions
  const captionFile = await new CaptionGenerator().generate(voiceFile);

  console.log("\n─────────────────────────────────────────");
  console.log(`💬 Captions: ${captionFile.id}`);
  console.log(`📄 SRT: ${captionFile.srtPath}`);
  console.log(`🔢 Segments: ${captionFile.segments.length}`);
  for (const seg of captionFile.segments) {
    const start = seg.start.toFixed(1).padStart(5);
    const end = seg.end.toFixed(1).padStart(5);
    console.log(`   [${start}s → ${end}s] ${seg.text}`);
  }

  // Step 11: Render final video
  const videoFile = await new Renderer().render(manifest, sceneMap, voiceFile, captionFile);

  console.log("\n─────────────────────────────────────────");
  console.log(`🎥 Video: ${videoFile.id}`);
  console.log(`📁 Path:  ${videoFile.videoPath}`);
  console.log(`⏱  Duration: ${videoFile.durationSeconds}s | Scenes: ${videoFile.sceneCount}`);

  // Step 12: Metadata
  const metadataFile = await new MetadataGenerator().generate(idea, script, videoFile);

  console.log("\n─────────────────────────────────────────");
  console.log(`🏷  Metadata: ${metadataFile.id}`);
  console.log(`📌 Title:    ${metadataFile.title}`);
  console.log(`📊 Priority: ${metadataFile.uploadPriority}/100`);
  console.log(`🏷  Tags:     ${metadataFile.tags.join(", ")}`);
  console.log(`#️⃣  Hashtags: ${metadataFile.hashtags.join(" ")}`);
  console.log(`\n📝 Description:\n   ${metadataFile.description}`);
  console.log(`\n🔀 Alternative Titles:`);
  metadataFile.alternativeTitles.forEach((t, i) => console.log(`   [${i + 1}] ${t}`));

  // Step 13: Upload to YouTube (private)
  const uploadFile = await publishVideo(videoFile, metadataFile, "private");

  console.log("\n─────────────────────────────────────────");
  console.log(`📺 Uploaded: ${uploadFile.url}`);
  console.log(`🆔 YouTube ID: ${uploadFile.youtubeId}`);
  console.log(`🔒 Visibility: ${uploadFile.visibility}`);
  console.log("─────────────────────────────────────────\n");
}

bootstrap();
