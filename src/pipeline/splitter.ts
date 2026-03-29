import type { GeminiClient } from '../gemini.js';
import type { RawChapter } from '../schemas.js';

export async function splitIntoChapters(gemini: GeminiClient, text: string): Promise<RawChapter[]> {
  return gemini.splitChapters(text);
}
