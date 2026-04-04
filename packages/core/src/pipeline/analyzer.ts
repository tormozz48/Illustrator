import type { AIProvider } from '../ai-provider.js';
import type { CharacterBible } from '../schemas/index.js';

export async function buildBible(client: AIProvider, text: string): Promise<CharacterBible> {
  return client.analyzeBook(text);
}
