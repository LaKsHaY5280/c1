import { gemini } from "../../services/gemini.service";

export interface StoryIdea {
  title: string;
  idea: string;
  genre: string;
  targetAudience: string;
}

export class IdeaGenerator {
  private prompt = `
Generate ONE viral YouTube Shorts story idea.

Requirements:
- Horror or mystery
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

    return JSON.parse(text) as StoryIdea;
  }
}
