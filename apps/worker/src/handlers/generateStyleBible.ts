import { STYLE_BIBLE_PROMPT, StyleBibleResponseSchema } from '@illustrator/shared/ai';
import { books, chapters } from '@illustrator/shared/db';
import type { GenerateStyleBiblePayload } from '@illustrator/shared/jobs';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { orchestrator } from '../orchestrator.js';
import { callGroq } from '../services/groq.js';

/**
 * Stage 2: Generate visual style bible for consistent illustrations
 * Triggered by: splitChapters completion
 * Next stage: processChapter (fan-out to N jobs)
 */
export async function handleGenerateStyleBible(job: Job<GenerateStyleBiblePayload>) {
  const { bookId, bookTitle, fullText } = job.data;

  logger.info({ bookId, jobId: job.id }, 'Starting style bible generation');

  try {
    // Call Groq to generate style bible
    const styleBible = await callGroq(STYLE_BIBLE_PROMPT(bookTitle, fullText), (data) =>
      StyleBibleResponseSchema.parse(data)
    );

    // Store style bible in book record
    await db
      .update(books)
      .set({
        styleBible,
        status: 'illustrating',
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));

    logger.info({ bookId, styleBible }, 'Style bible generated');

    // Get all chapter IDs for fan-out
    const bookChapters = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.bookId, bookId));

    const chapterIds = bookChapters.map((ch) => ch.id);

    // Trigger next stage: process all chapters (fan-out)
    await orchestrator.onStyleBibleComplete(bookId, chapterIds);
  } catch (error) {
    logger.error({ bookId, error }, 'Style bible generation failed');
    await orchestrator.markBookFailed(bookId, `Style bible generation failed: ${error}`);
    throw error;
  }
}
