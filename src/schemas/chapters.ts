import { z } from 'zod';

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
  /** Entity names (characters, creatures, objects, etc.) present in this scene. */
  entities: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  insertAfterParagraph: z.number().int().nonnegative(),
});
export type KeyScene = z.infer<typeof KeySceneSchema>;
