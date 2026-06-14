import { IdeaGenerator } from "./modules/story/idea";
import { ScriptGenerator } from "./modules/story/script";

async function bootstrap() {
  console.log("🚀 Started");
  console.log(`📅 Day: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}`);

  // Step 1: Generate idea
  const ideaGenerator = new IdeaGenerator();
  const idea = await ideaGenerator.generate();

  console.log("\n─────────────────────────────────────────");
  console.log(`🎬 [${idea.genre.toUpperCase()}] ${idea.title}`);
  console.log(`🆔 ${idea.id}`);
  console.log(`\n🪝 Hook:\n   "${idea.hook}"`);
  console.log(`\n💡 Idea:\n   ${idea.idea}`);
  console.log(`\n🚀 Viral Angle:\n   ${idea.viralAngle}`);
  console.log(`\n👥 Target Audience: ${idea.targetAudience}`);

  // Step 2: Generate script from idea
  const scriptGenerator = new ScriptGenerator();
  const script = await scriptGenerator.generate(idea);

  console.log("\n─────────────────────────────────────────");
  console.log(`📄 Script: ${script.id}`);
  console.log(`⏱  Duration: ~${script.estimatedDuration}s`);
  console.log(`🎭 Emotion: ${script.emotion}  |  📂 Type: ${script.storyType}`);
  console.log(`\n🪝 Hook:\n   ${script.hook}`);
  console.log(`\n📖 Setup:\n   ${script.setup}`);
  console.log(`\n📈 Escalation:\n   ${script.escalation}`);
  console.log(`\n💥 Climax:\n   ${script.climax}`);
  console.log(`\n🎯 Ending:\n   ${script.ending}`);
  console.log("\n🎥 Visual Moments:");
  script.visualMoments.forEach((moment, i) => {
    console.log(`   ${i + 1}. ${moment}`);
  });
  console.log("─────────────────────────────────────────\n");
}

bootstrap();
