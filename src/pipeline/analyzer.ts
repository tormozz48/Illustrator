import type { GeminiClient } from '../gemini.js';
import type { CharacterBible } from '../schemas.js';

export async function buildBible(gemini: GeminiClient, text: string): Promise<CharacterBible> {
  return gemini.analyzeBook(text);
}
