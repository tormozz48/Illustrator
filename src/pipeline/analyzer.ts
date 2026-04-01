import type { OpenRouterClient } from '../openRouter.js';
import type { CharacterBible } from '../schemas/index.js';

export async function buildBible(client: OpenRouterClient, text: string): Promise<CharacterBible> {
  return client.analyzeBook(text);
}
