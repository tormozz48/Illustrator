import type { AIProvider } from '../ai-provider.js';
import type { RawChapter } from '../schemas/index.js';

export async function splitIntoChapters(client: AIProvider, text: string): Promise<RawChapter[]> {
  return client.splitChapters(text);
}
