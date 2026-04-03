import type { GeminiClient } from '../gemini.js';
import type { CharacterBible } from '../schemas/index.js';

export async function buildBible(
  client: GeminiClient,
  text: string
): Promise<CharacterBible> {
  return client.analyzeBook(text);
}
