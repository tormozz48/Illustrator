import { z } from 'zod';

/**
 * AI Service Schemas
 * Zod schemas for parsing AI model responses
 */

// ============================================================================
// Chapter Splitter Response (Groq LLaMA)
// ============================================================================

/**
 * Expected response from Groq when splitting book into chapters
 */
export const ChapterSplitResponseSchema = z.object({
  chapters: z.array(
    z.object({
      chapterNumber: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ),
});
export type ChapterSplitResponse = z.infer<typeof ChapterSplitResponseSchema>;

/**
 * Prompt template for chapter splitting
 */
export const CHAPTER_SPLIT_PROMPT = (bookText: string) => `
You are a book chapter splitter. Split the following book text into logical chapters.

Rules:
- Detect chapter boundaries based on "Chapter N" headings or natural story breaks
- Extract chapter number and title
- Include all content for each chapter
- Output valid JSON matching this structure:
{
  "chapters": [
    { "chapterNumber": "1", "title": "Chapter Title", "content": "Full chapter text..." }
  ]
}

Book text:
${bookText}
`;

// ============================================================================
// Style Bible Generator Response (Groq LLaMA)
// ============================================================================

/**
 * Expected response from Groq when generating style bible
 */
export const StyleBibleResponseSchema = z.object({
  characterDescriptions: z.array(
    z.object({
      name: z.string(),
      appearance: z.string(),
      traits: z.string(),
    })
  ),
  visualTone: z.string(),
  colorPalette: z.array(z.string()),
  sceneContext: z.string(),
});
export type StyleBibleResponse = z.infer<typeof StyleBibleResponseSchema>;

/**
 * Prompt template for style bible generation
 */
export const STYLE_BIBLE_PROMPT = (bookTitle: string, fullText: string) => `
You are a visual style guide creator for illustrated books.

Analyze the following book and create a style bible for consistent AI-generated illustrations.

Book title: ${bookTitle}

Extract:
1. characterDescriptions: Array of main characters with name, physical appearance, and personality traits
2. visualTone: Overall artistic mood (e.g., "whimsical watercolor", "dark gothic", "bright cartoon")
3. colorPalette: 4-6 hex color codes that match the book's tone
4. sceneContext: Brief setting description (time period, location, world type)

Output valid JSON matching this structure:
{
  "characterDescriptions": [
    { "name": "Character Name", "appearance": "Physical description", "traits": "Personality" }
  ],
  "visualTone": "Brief tone description",
  "colorPalette": ["#RRGGBB", "#RRGGBB"],
  "sceneContext": "Setting context"
}

Book text (truncated if needed):
${fullText.slice(0, 8000)}
`;

// ============================================================================
// Scene Description Generator Response (Groq LLaMA)
// ============================================================================

/**
 * Expected response from Groq when generating scene description for a chapter
 */
export const SceneDescriptionResponseSchema = z.object({
  sceneDescription: z.string(),
});
export type SceneDescriptionResponse = z.infer<typeof SceneDescriptionResponseSchema>;

/**
 * Prompt template for scene description generation
 */
export const SCENE_DESCRIPTION_PROMPT = (
  chapterTitle: string,
  chapterContent: string,
  styleBible: StyleBibleResponse
) => `
You are an AI illustration prompt generator.

Create a single detailed scene description for this chapter that will be used to generate an illustration.

Chapter: ${chapterTitle}
Content: ${chapterContent.slice(0, 2000)}

Style Bible:
- Visual Tone: ${styleBible.visualTone}
- Color Palette: ${styleBible.colorPalette.join(', ')}
- Scene Context: ${styleBible.sceneContext}
- Characters: ${styleBible.characterDescriptions.map((c) => `${c.name} (${c.appearance})`).join(', ')}

Requirements:
- Focus on ONE key moment from the chapter
- Include character appearances from style bible if they appear
- Match the visual tone and color palette
- Keep it under 150 words
- Be specific about composition, lighting, and mood

Output valid JSON:
{
  "sceneDescription": "Detailed scene description here..."
}
`;

// ============================================================================
// Pollinations Image Generation Config
// ============================================================================

/**
 * Pollinations API parameters for image generation
 */
export const PollinationsConfigSchema = z.object({
  prompt: z.string(),
  model: z.enum(['flux', 'flux-realism', 'flux-anime', 'turbo']).default('flux'),
  width: z.number().default(1024),
  height: z.number().default(1024),
  seed: z.number().optional(),
  nologo: z.boolean().default(true),
  enhance: z.boolean().default(false),
});
export type PollinationsConfig = z.infer<typeof PollinationsConfigSchema>;

/**
 * Build Pollinations API URL from config
 */
export function buildPollinationsUrl(config: PollinationsConfig): string {
  const params = new URLSearchParams({
    model: config.model,
    width: config.width.toString(),
    height: config.height.toString(),
    nologo: config.nologo.toString(),
    enhance: config.enhance.toString(),
  });

  if (config.seed) {
    params.set('seed', config.seed.toString());
  }

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(config.prompt)}?${params}`;
}
