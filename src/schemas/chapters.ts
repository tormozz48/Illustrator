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

// ── Reference-based splitting ──────────────────────────────────────────────────
// The LLM returns lightweight boundary markers instead of the full chapter text.
// This reduces output tokens from ~100k to ~2k for long books, eliminating the
// primary cause of truncated/malformed JSON in splitChapters responses.

export const ChapterBoundarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  startMarker: z.string().min(10),
  endMarker: z.string().min(10),
});
export type ChapterBoundary = z.infer<typeof ChapterBoundarySchema>;

export const ChapterBoundaryResultSchema = z.object({
  chapters: z.array(ChapterBoundarySchema).min(1),
});
export type ChapterBoundaryResult = z.infer<typeof ChapterBoundaryResultSchema>;

export const KeySceneSchema = z.object({
  description: z.string(),
  entities: z.array(z.string()),
  setting: z.string(),
  mood: z.string(),
  insertAfterParagraph: z.number().int().nonnegative(),
});
export type KeyScene = z.infer<typeof KeySceneSchema>;
