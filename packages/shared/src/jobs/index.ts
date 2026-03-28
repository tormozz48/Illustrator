import { z } from 'zod';

/**
 * BullMQ Job Contracts
 * Maps job names → typed payloads for type-safe job dispatch
 */

// ============================================================================
// Job Name Constants
// ============================================================================

export const JOB_NAMES = {
  SPLIT_CHAPTERS: 'splitChapters',
  GENERATE_STYLE_BIBLE: 'generateStyleBible',
  PROCESS_CHAPTER: 'processChapter',
  ASSEMBLE_BOOK: 'assembleBook',
} as const;

// ============================================================================
// Job Payload Schemas
// ============================================================================

/**
 * splitChapters — Stage 1: Split uploaded book into chapters
 * Triggered by: POST /api/upload completion
 */
export const SplitChaptersPayloadSchema = z.object({
  bookId: z.string().uuid(),
  fileUrl: z.string().url(),
});
export type SplitChaptersPayload = z.infer<typeof SplitChaptersPayloadSchema>;

/**
 * generateStyleBible — Stage 2: Create visual consistency guide
 * Triggered by: splitChapters completion
 */
export const GenerateStyleBiblePayloadSchema = z.object({
  bookId: z.string().uuid(),
  bookTitle: z.string(),
  fullText: z.string(), // Concatenated chapter content for analysis
});
export type GenerateStyleBiblePayload = z.infer<typeof GenerateStyleBiblePayloadSchema>;

/**
 * processChapter — Stage 3: Generate scene description + illustration for one chapter
 * Triggered by: generateStyleBible completion (fan-out to N jobs)
 */
export const ProcessChapterPayloadSchema = z.object({
  bookId: z.string().uuid(),
  chapterId: z.string().uuid(),
});
export type ProcessChapterPayload = z.infer<typeof ProcessChapterPayloadSchema>;

/**
 * assembleBook — Stage 4: Combine chapters + illustrations into final PDF
 * Triggered by: Last processChapter completion (atomic counter check)
 */
export const AssembleBookPayloadSchema = z.object({
  bookId: z.string().uuid(),
});
export type AssembleBookPayload = z.infer<typeof AssembleBookPayloadSchema>;

// ============================================================================
// Job Contract Map (for type-safe dispatch)
// ============================================================================

export type JobContracts = {
  [JOB_NAMES.SPLIT_CHAPTERS]: SplitChaptersPayload;
  [JOB_NAMES.GENERATE_STYLE_BIBLE]: GenerateStyleBiblePayload;
  [JOB_NAMES.PROCESS_CHAPTER]: ProcessChapterPayload;
  [JOB_NAMES.ASSEMBLE_BOOK]: AssembleBookPayload;
};
