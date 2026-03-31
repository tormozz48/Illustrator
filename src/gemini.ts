import { GoogleGenAI } from "@google/genai";
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

const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";

export class GeminiClient {
  private readonly genAI: GoogleGenAI;

  constructor(apiKey: string = config.GEMINI_API_KEY) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async analyzeBook(text: string): Promise<CharacterBible> {
    const prompt = analyzeBookPrompt(text);

    const result = await this.genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const json = JSON.parse(result.text ?? "") as unknown;
    return CharacterBibleSchema.parse(json);
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const prompt = splitChaptersPrompt(text);

    const result = await this.genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const json = JSON.parse(result.text ?? "") as unknown;
    const parsed = SplitResultSchema.parse(json);
    return parsed.chapters;
  }

  async findKeyScene(
    chapter: RawChapter,
    bible: CharacterBible
  ): Promise<KeyScene> {
    const prompt = findKeyScenePrompt(chapter, bible);

    const result = await this.genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const json = JSON.parse(result.text ?? "") as unknown;
    return KeySceneSchema.parse(json);
  }

  async generateImage(prompt: string, refs: Buffer[] = []): Promise<Buffer> {
    type Part =
      | { text: string }
      | { inlineData: { mimeType: string; data: string } };

    const parts: Part[] = [];

    for (const ref of refs) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: ref.toString("base64"),
        },
      });
    }

    parts.push({ text: prompt });

    const result = await this.genAI.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE"],
      },
    });

    const candidate = result.candidates?.[0];
    if (!candidate) throw new Error("No image candidate returned from Gemini");

    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }

    throw new Error("No image data in Gemini response");
  }

  async validateImage(
    image: Buffer,
    bible: CharacterBible
  ): Promise<ValidationResult> {
    const prompt = validateImagePrompt(bible);

    const result = await this.genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: image.toString("base64"),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const json = JSON.parse(result.text ?? "") as unknown;
    return ValidationResultSchema.parse(json);
  }
}
