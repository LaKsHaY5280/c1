import { IdeaGenerator } from "./modules/story/idea";
import { ScriptGenerator } from "./modules/story/script";
import { CharacterGenerator } from "./modules/story/character";
import { SceneGenerator } from "./modules/story/scene";

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
  console.log(`⏱  Duration: ~${script.estimatedDuration}s  |  🎭 ${script.emotion}  |  📂 ${script.storyType}`);
  console.log(`\n🪝 Hook:\n   ${script.hook}`);
  console.log(`\n📖 Setup:\n   ${script.setup}`);
  console.log(`\n📈 Escalation:\n   ${script.escalation}`);
  console.log(`\n💥 Climax:\n   ${script.climax}`);
  console.log(`\n🎯 Ending:\n   ${script.ending}`);

  // Step 3: Characters
  const characterFile = await new CharacterGenerator().generate(script);

  console.log("\n─────────────────────────────────────────");
  console.log(`👤 Characters: ${characterFile.id}`);
  for (const c of characterFile.characters) {
    console.log(`\n  ${c.name}, ${c.age} (${c.gender})`);
    console.log(`  👁  ${c.appearance}`);
    console.log(`  💭 ${c.emotionProfile}`);
  }

  // Step 4: Scenes
  const sceneFile = await new SceneGenerator().generate(script, characterFile.characters);

  console.log("\n─────────────────────────────────────────");
  console.log(`🎥 Scenes: ${sceneFile.id}`);
  for (const scene of sceneFile.scenes) {
    console.log(`\n  [${scene.sceneNumber}] ${scene.purpose.toUpperCase()} — ${scene.duration}s — ${scene.emotion}`);
    console.log(`  🆔 ${scene.id}`);
    console.log(`  📷 ${scene.description}`);
  }
  console.log("─────────────────────────────────────────\n");
}

bootstrap();
