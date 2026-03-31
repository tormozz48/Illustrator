import { z } from 'zod';

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
