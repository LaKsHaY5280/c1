import { IdeaGenerator } from "./modules/story/idea";
import { ScriptGenerator } from "./modules/story/script";
import { CharacterGenerator } from "./modules/story/character";
import { SceneGenerator } from "./modules/story/scene";
import { ImagePromptGenerator } from "./modules/media/image-prompt";

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

  // Step 3: Characters (extract from script — do not invent)
  const characterFile = await new CharacterGenerator().generate(script);

  console.log("\n─────────────────────────────────────────");
  console.log(`👤 Characters: ${characterFile.id}`);
  for (const c of characterFile.characters) {
    console.log(`\n  [${c.role}] ${c.name}, ${c.age} (${c.gender})`);
    console.log(`  👁  ${c.appearance}`);
    console.log(`  👗 ${c.clothing}`);
    console.log(`  💭 ${c.emotionProfile}`);
  }

  // Step 4: Scenes (world context comes from script — no separate context file)
  const sceneFile = await new SceneGenerator().generate(
    script,
    characterFile.characters,
  );

  console.log("\n─────────────────────────────────────────");
  console.log(`🎥 Scenes: ${sceneFile.id}`);
  for (const scene of sceneFile.scenes) {
    console.log(`\n  [${scene.sceneNumber}] ${scene.purpose.toUpperCase()} — ${scene.duration}s — ${scene.emotion}`);
    console.log(`  🆔 ${scene.id}`);
    console.log(`  📷 ${scene.description}`);
  }

  // Step 5: Image Prompts
  const promptFile = await new ImagePromptGenerator().generate(
    sceneFile,
    characterFile.characters,
    script,
  );

  console.log("\n─────────────────────────────────────────");
  console.log(`🖼  Image Prompts: ${promptFile.id}`);
  console.log(`🎨 Base Style: ${promptFile.baseStyle}`);
  for (const p of promptFile.prompts) {
    console.log(`\n  [${p.sceneNumber}] ${p.purpose.toUpperCase()} — ${p.id}`);
    console.log(`  ✏️  ${p.prompt}`);
    console.log(`  ✅ ${p.fullPrompt}`);
    console.log(`  ❌ ${p.negativePrompt}`);
  }
  console.log("─────────────────────────────────────────\n");
}

bootstrap();
