import { z } from 'zod';
import { CharacterBibleSchema } from './bible.js';
import { KeySceneSchema, RawChapterSchema } from './chapters.js';

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
