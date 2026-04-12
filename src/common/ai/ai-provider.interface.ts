export interface BookBible {
  classification: any;
  entities: any[];
  style_guide: any;
  environments: any[];
}

export interface ChapterBoundary {
  number: number;
  title: string;
  startMarker: string;
  endMarker: string;
}

export interface KeyScene {
  paragraph_index: number;
  description: string;
  visual_description: string;
  entities: string[];
  setting: string;
  mood: string;
}

export interface ValidationResult {
  score: number;
  traits: Record<string, number>;
  suggestions: string[];
}

export interface IAIProvider {
  analyzeBook(text: string): Promise<BookBible>;
  splitChapters(text: string): Promise<ChapterBoundary[]>;
  findKeyScenes(chapterText: string, bible: BookBible, chapterNumber: number): Promise<KeyScene[]>;
  generateImage(prompt: string, referenceImages?: Buffer[]): Promise<Buffer>;
  validateImage(image: Buffer, bible: BookBible): Promise<number>;
}

export const AI_PROVIDER = 'AI_PROVIDER';
