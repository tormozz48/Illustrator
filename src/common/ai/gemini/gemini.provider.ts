import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { IAIProvider, BookBible, ChapterBoundary, KeyScene } from '../ai-provider.interface';
import {
  buildAnalyzeBookPrompt,
  buildSplitChaptersPrompt,
  buildFindKeyScenesPrompt,
  buildValidateImagePrompt,
} from '../../../prompts';

@Injectable()
export class GeminiProvider implements IAIProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenAI;
  private textModel = "gemini-2.5-flash";
  private imageModel = "gemini-2.5-flash-image";

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyzeBook(text: string): Promise<BookBible> {
    const prompt = buildAnalyzeBookPrompt(text);
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });
    return JSON.parse(response.text ?? "{}");
  }

  async splitChapters(text: string): Promise<ChapterBoundary[]> {
    const prompt = buildSplitChaptersPrompt(text);
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });
    const result = JSON.parse(response.text ?? "{}");
    return result.chapters || result;
  }

  async findKeyScenes(
    chapterText: string,
    bible: BookBible,
    chapterNumber: number
  ): Promise<KeyScene[]> {
    const prompt = buildFindKeyScenesPrompt(chapterText, bible, chapterNumber);
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });
    const result = JSON.parse(response.text ?? "{}");
    return result.scenes || result;
  }

  async generateImage(
    prompt: string,
    referenceImages?: Buffer[]
  ): Promise<Buffer> {
    const parts: any[] = [];

    if (referenceImages?.length) {
      for (const img of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: "image/webp",
            data: img.toString("base64"),
          },
        });
      }
    }

    parts.push({ text: prompt });

    const response = await this.client.models.generateContent({
      model: this.imageModel,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["image", "text"],
        temperature: 1.0,
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) =>
      p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error("No image generated");
    }

    return Buffer.from(imagePart.inlineData.data, "base64");
  }

  async validateImage(image: Buffer, bible: BookBible): Promise<number> {
    const prompt = buildValidateImagePrompt(bible);
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/webp",
                data: image.toString("base64"),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });
    const result = JSON.parse(response.text ?? "{}");
    return typeof result.score === "number" ? result.score : 0.5;
  }
}
