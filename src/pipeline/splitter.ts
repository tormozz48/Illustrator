import type { OpenRouterClient } from '../openRouter.js';
import type { RawChapter } from '../schemas/index.js';

export async function splitIntoChapters(client: OpenRouterClient, text: string): Promise<RawChapter[]> {
  return client.splitChapters(text);
}
