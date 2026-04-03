import type { GeminiClient } from '../gemini.js';
import type { RawChapter } from '../schemas/index.js';

export async function splitIntoChapters(client: GeminiClient, text: string): Promise<RawChapter[]> {
  return client.splitChapters(text);
}
