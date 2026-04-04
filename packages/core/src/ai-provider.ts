import type { CharacterBible, KeyScene, RawChapter, ValidationResult } from './schemas/index.js';

/**
 * Provider-agnostic AI client interface.
 * GeminiClient implements this — pipeline stages depend only on this interface.
 */
export interface AIProvider {
  /** Full book text → structured Character Bible (JSON) */
  analyzeBook(text: string): Promise<CharacterBible>;

  /** Full book text → chapter boundaries → sliced RawChapter[] */
  splitChapters(text: string): Promise<RawChapter[]>;

  /** Chapter + bible → key scene for illustration */
  findKeyScene(chapter: RawChapter, bible: CharacterBible): Promise<KeyScene>;

  /**
   * Generate an image from a text prompt with optional reference images.
   *
   * @param prompt  Text description of the image to generate
   * @param refs    Optional reference images for visual consistency (anchor portraits)
   */
  generateImage(prompt: string, refs?: Buffer[]): Promise<Buffer>;

  /** Score a generated image against the bible for visual consistency */
  validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult>;
}
