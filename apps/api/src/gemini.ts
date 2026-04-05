import { GoogleGenAI } from '@google/genai';
import type { AIProvider } from './ai-provider.js';
import { getLogger } from './logger.js';
import { analyzeBookPrompt } from './prompts/analyzeBook.js';
import { findKeySceneFallbackPrompt, findKeyScenePrompt } from './prompts/findKeyScene.js';
import { splitChaptersPrompt } from './prompts/splitChapters.js';
import { validateImagePrompt } from './prompts/validateImage.js';
import { ChapterBoundaryResultSchema } from './schemas/chapters.js';
import {
  type CharacterBible,
  CharacterBibleSchema,
  type KeyScene,
  KeySceneSchema,
  type RawChapter,
  type ValidationResult,
  ValidationResultSchema,
} from './schemas/index.js';
import { callWithJsonRetry } from './utils/llmRetry.js';
import { sliceChapters } from './utils/sliceChapters.js';
import { estimateTruncationRisk } from './utils/truncationGuard.js';

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export class GeminiClient implements AIProvider {
  private readonly genAI: GoogleGenAI;

  /**
   * @param apiKey  Google Gemini API key. Required — no environment fallback
   *                so that the client stays independent of dotenv/process.env.
   */
  constructor(apiKey: string) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async analyzeBook(text: string): Promise<CharacterBible> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({
      inputChars: text.length,
      expectedOutputSchema: 'bible',
    });
    if (risk !== 'low') {
      logger.warn(
        `analyzeBook: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars)`
      );
    }

    return callWithJsonRetry({
      call: async () => {
        const result = await this.genAI.models.generateContent({
          model: TEXT_MODEL,
          contents: [{ role: 'user', parts: [{ text: analyzeBookPrompt(text) }] }],
          config: { responseMimeType: 'application/json' },
        });
        return result.text;
      },
      schema: CharacterBibleSchema,
      label: 'analyzeBook',
    });
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const logger = getLogger();
    const risk = estimateTruncationRisk({
      inputChars: text.length,
      expectedOutputSchema: 'chapters',
    });
    if (risk !== 'low') {
      logger.warn(
        `splitChapters: truncation risk is "${risk}" (input ${text.length.toLocaleString()} chars) — using boundary markers`
      );
    }

    const boundaries = await callWithJsonRetry({
      call: async () => {
        const result = await this.genAI.models.generateContent({
          model: TEXT_MODEL,
          contents: [{ role: 'user', parts: [{ text: splitChaptersPrompt(text) }] }],
          config: { responseMimeType: 'application/json' },
        });
        return result.text;
      },
      schema: ChapterBoundaryResultSchema,
      label: 'splitChapters',
    });

    return sliceChapters(text, boundaries.chapters);
  }

  async findKeyScene(chapter: RawChapter, bible: CharacterBible): Promise<KeyScene> {
    const logger = getLogger();
    let useFallback = false;
    return callWithJsonRetry({
      call: async () => {
        const prompt = useFallback
          ? findKeySceneFallbackPrompt(chapter, bible)
          : findKeyScenePrompt(chapter, bible);
        const result = await this.genAI.models.generateContent({
          model: TEXT_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json' },
        });
        if (!result.text) {
          const finishReason = result.candidates?.[0]?.finishReason ?? 'no-candidates';
          const blockReason =
            (result as unknown as { promptFeedback?: { blockReason?: string } }).promptFeedback
              ?.blockReason ?? 'none';
          logger.warn(
            `findKeyScene(ch${chapter.number}): empty text — finishReason=${finishReason}, blockReason=${blockReason}${useFallback ? ' (fallback prompt)' : ' — switching to fallback prompt'}`
          );
          useFallback = true;
        }
        return result.text;
      },
      schema: KeySceneSchema,
      label: `findKeyScene(ch${chapter.number})`,
    });
  }

  async generateImage(prompt: string, refs: Buffer[] = []): Promise<Buffer> {
    type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

    const parts: Part[] = [];

    for (const ref of refs) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: ref.toString('base64'),
        },
      });
    }

    parts.push({ text: prompt });

    const result = await this.genAI.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const candidate = result.candidates?.[0];
    if (!candidate) {
      throw new Error('No image candidate returned from Gemini');
    }

    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }

    throw new Error('No image data in Gemini response');
  }

  async validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult> {
    return callWithJsonRetry({
      call: async () => {
        const result = await this.genAI.models.generateContent({
          model: TEXT_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: image.toString('base64'),
                  },
                },
                { text: validateImagePrompt(bible) },
              ],
            },
          ],
          config: { responseMimeType: 'application/json' },
        });
        return result.text;
      },
      schema: ValidationResultSchema,
      label: 'validateImage',
    });
  }
}
