import { OpenRouter } from "@openrouter/sdk";
import { config } from "./config.js";
import { analyzeBookPrompt } from "./prompts/analyzeBook.js";
import { findKeyScenePrompt } from "./prompts/findKeyScene.js";
import { splitChaptersPrompt } from "./prompts/splitChapters.js";
import { validateImagePrompt } from "./prompts/validateImage.js";
import {
  type CharacterBible,
  CharacterBibleSchema,
  type KeyScene,
  KeySceneSchema,
  type RawChapter,
  SplitResultSchema,
  type ValidationResult,
  ValidationResultSchema,
} from "./schemas/index.js";

const TEXT_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

export class OpenRouterClient {
  private readonly client: OpenRouter;

  constructor(apiKey: string = config.OPENROUTER_API_KEY) {
    this.client = new OpenRouter({ apiKey });
  }

  async analyzeBook(text: string): Promise<CharacterBible> {
    const prompt = analyzeBookPrompt(text);
    const text_ = await this.generateText(prompt);
    const json = JSON.parse(text_) as unknown;
    return CharacterBibleSchema.parse(json);
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const prompt = splitChaptersPrompt(text);
    const text_ = await this.generateText(prompt);
    const json = JSON.parse(text_) as unknown;
    const parsed = SplitResultSchema.parse(json);
    return parsed.chapters;
  }

  async findKeyScene(
    chapter: RawChapter,
    bible: CharacterBible
  ): Promise<KeyScene> {
    const prompt = findKeyScenePrompt(chapter, bible);
    const text_ = await this.generateText(prompt);
    const json = JSON.parse(text_) as unknown;
    return KeySceneSchema.parse(json);
  }

  async generateImage(prompt: string, _refs: Buffer[] = []): Promise<Buffer> {
    const result = await this.client.chat.send({
      chatGenerationParams: {
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image"],
        stream: false,
      },
    });

    const image = result.choices[0]?.message.images?.[0];
    if (!image) {
      throw new Error("No image generated.");
    }

    const url = image.imageUrl.url;
    if (url.startsWith("data:")) {
      const base64 = url.slice(url.indexOf(",") + 1);
      return Buffer.from(base64, "base64");
    }
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }

  async validateImage(
    image: Buffer,
    bible: CharacterBible
  ): Promise<ValidationResult> {
    const prompt = validateImagePrompt(bible);

    const result = await this.client.chat.send({
      chatGenerationParams: {
        model: TEXT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                imageUrl: {
                  url: `data:image/jpeg;base64,${image.toString("base64")}`,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
        responseFormat: { type: "json_object" },
        stream: false,
      },
    });

    const text = extractText(result.choices[0]?.message.content);
    const json = JSON.parse(text) as unknown;
    return ValidationResultSchema.parse(json);
  }

  private async generateText(prompt: string): Promise<string> {
    const result = await this.client.chat.send({
      chatGenerationParams: {
        model: TEXT_MODEL,
        messages: [{ role: "user", content: prompt }],
        responseFormat: { type: "json_object" },
        stream: false,
      },
    });

    return extractText(result.choices[0]?.message.content);
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } => p?.type === "text")
      .map((p) => p.text)
      .join("");
  }
  throw new Error(
    `Unexpected content type in model response: ${JSON.stringify(content)}`
  );
}
