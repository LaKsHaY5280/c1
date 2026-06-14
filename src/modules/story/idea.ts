import { gemini } from "../../services/gemini.service";
import { storage } from "../storage";
import { AssetType, generateId } from "../id-generator";

export interface StoryIdea {
  id: string;
  title: string;
  idea: string;
  genre: string;
  targetAudience: string;
  createdAt: string;
}

export class IdeaGenerator {
  private prompt = `
Generate ONE viral YouTube Shorts story idea.

Requirements:
- Horror or mystery or science fiction or fantasy or thriller
- Suitable for 60 second video
- Strong hook
- Unique concept

Return JSON only:

{
  "title": "",
  "idea": "",
  "genre": "",
  "targetAudience": ""
}
`;

  async generate(): Promise<StoryIdea> {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: this.prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";

    const parsed = JSON.parse(text);

    const sequence = await storage.getNextSequence("story/ideas");

    const id = generateId(AssetType.IDEA, parsed.genre, sequence);

    const storyIdea: StoryIdea = {
      id,
      title: parsed.title,
      idea: parsed.idea,
      genre: parsed.genre,
      targetAudience: parsed.targetAudience,
      createdAt: new Date().toISOString(),
    };

    await storage.save("story/ideas", storyIdea.id, storyIdea);

    return storyIdea;
  }
}