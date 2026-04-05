import { z } from 'zod';

export const SceneSchema = z.object({
  description: z.string(),
  visualDescription: z.string(),
  entities: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  insertAfterParagraph: z.number().int().nonnegative(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScenesResultSchema = z.object({
  scenes: z.array(SceneSchema).min(2).max(3),
});
export type ScenesResult = z.infer<typeof ScenesResultSchema>;
