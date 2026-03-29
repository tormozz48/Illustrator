import { z } from 'zod';

// ============================================================================
// Character & Style Bible
// ============================================================================

export const CharacterSheetSchema = z.object({
  name: z.string(),
  age: z.string(),
  gender: z.string(),
  build: z.string(),
  height: z.string(),
  skinTone: z.string(),
  hairColor: z.string(),
  hairStyle: z.string(),
  eyeColor: z.string(),
  facialFeatures: z.string(),
  clothing: z.string(),
  accessories: z.array(z.string()),
  distinctiveFeatures: z.array(z.string()),
  role: z.enum(['protagonist', 'mentor', 'antagonist', 'supporting', 'minor']),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

export const StyleGuideSchema = z.object({
  artStyle: z.string(),
  colorPalette: z.string(),
  mood: z.string(),
  lighting: z.string(),
  lineWork: z.string(),
  negativePrompt: z.string(),
  stylePrefix: z.string(),
});
export type StyleGuide = z.infer<typeof StyleGuideSchema>;

export const SettingSchema = z.object({
  name: z.string(),
  visualDescription: z.string(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const CharacterBibleSchema = z.object({
  characters: z.array(CharacterSheetSchema),
  styleGuide: StyleGuideSchema,
  settings: z.array(SettingSchema),
});
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;

// ============================================================================
// Chapters & Scenes
// ============================================================================

export const RawChapterSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  content: z.string(),
});
export type RawChapter = z.infer<typeof RawChapterSchema>;

export const SplitResultSchema = z.object({
  chapters: z.array(RawChapterSchema),
});
export type SplitResult = z.infer<typeof SplitResultSchema>;

export const KeySceneSchema = z.object({
  description: z.string(),
  characters: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  insertAfterParagraph: z.number().int().nonnegative(),
});
export type KeyScene = z.infer<typeof KeySceneSchema>;

// ============================================================================
// Validation
// ============================================================================

export const ValidationResultSchema = z.object({
  score: z.number().min(0).max(1),
  traits: z.record(z.string(), z.number()),
  suggestions: z.array(z.string()).optional(),
  pass: z.boolean(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ============================================================================
// Illustrations & Output
// ============================================================================

export const IllustrationSchema = z.object({
  imageBase64: z.string(),
  prompt: z.string(),
  width: z.number(),
  height: z.number(),
  validationScore: z.number(),
});
export type Illustration = z.infer<typeof IllustrationSchema>;

export const EnrichedChapterSchema = RawChapterSchema.extend({
  keyScene: KeySceneSchema,
  illustration: IllustrationSchema.optional(),
});
export type EnrichedChapter = z.infer<typeof EnrichedChapterSchema>;

export const BookResultSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  bible: CharacterBibleSchema,
  chapters: z.array(EnrichedChapterSchema),
  html: z.string(),
});
export type BookResult = z.infer<typeof BookResultSchema>;

// ============================================================================
// Config
// ============================================================================

export const ArtStyleSchema = z.enum(['watercolor', 'comic', 'realistic', 'anime']);
export type ArtStyle = z.infer<typeof ArtStyleSchema>;

export const AppConfigSchema = z.object({
  inputPath: z.string(),
  outputDir: z.string().default('./output'),
  style: ArtStyleSchema.default('watercolor'),
  concurrency: z.number().int().min(1).max(10).default(3),
  noCache: z.boolean().default(false),
  verbose: z.boolean().default(false),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
