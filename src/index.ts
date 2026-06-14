import { IdeaGenerator } from "./modules/story/idea";

async function bootstrap() {
  console.log("🚀 Started");

  const generator = new IdeaGenerator();

  const idea = await generator.generate();

  console.log(idea);
}

bootstrap();
