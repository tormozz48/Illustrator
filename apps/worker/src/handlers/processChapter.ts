import { randomUUID } from 'node:crypto';
import { SCENE_DESCRIPTION_PROMPT, SceneDescriptionResponseSchema } from '@illustrator/shared/ai';
import { books, chapters } from '@illustrator/shared/db';
import type { ProcessChapterPayload } from '@illustrator/shared/jobs';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { orchestrator } from '../orchestrator.js';
import { callGroq } from '../services/groq.js';
import { generateImage } from '../services/pollinations.js';
import { uploadToR2 } from '../services/storage.js';

/**
 * Stage 3: Generate scene description + illustration for one chapter
 * Triggered by: generateStyleBible completion (fan-out to N jobs)
 * Next stage: assembleBook (when all chapters complete via atomic counter)
 */
export async function handleProcessChapter(job: Job<ProcessChapterPayload>) {
  const { bookId, chapterId } = job.data;

  logger.info({ bookId, chapterId, jobId: job.id }, 'Starting chapter processing');

  try {
    // Get chapter and book (with style bible)
    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);

    if (!chapter) {
      throw new Error('Chapter not found');
    }

    const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);

    if (!book || !book.styleBible) {
      throw new Error('Book or style bible not found');
    }

    // Mark chapter as processing
    await db
      .update(chapters)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(chapters.id, chapterId));

    // Generate scene description using Groq
    const sceneResult = await callGroq(
      SCENE_DESCRIPTION_PROMPT(chapter.title, chapter.content, book.styleBible),
      (data) => SceneDescriptionResponseSchema.parse(data)
    );

    // Generate illustration using Pollinations
    const imageBuffer = await generateImage(sceneResult.sceneDescription);

    // Upload to R2
    const imageKey = `illustrations/${bookId}/${chapterId}-${randomUUID()}.png`;
    const illustrationUrl = await uploadToR2(imageKey, imageBuffer, 'image/png');

    // Update chapter with results
    await db
      .update(chapters)
      .set({
        sceneDescription: sceneResult.sceneDescription,
        illustrationUrl,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(chapters.id, chapterId));

    logger.info({ bookId, chapterId, illustrationUrl }, 'Chapter processing completed');

    // Check if all chapters are complete (atomic counter)
    await orchestrator.onChapterComplete(bookId);
  } catch (error) {
    logger.error({ bookId, chapterId, error }, 'Chapter processing failed');

    // Mark chapter as failed
    await db
      .update(chapters)
      .set({
        status: 'failed',
        errorMessage: String(error),
        updatedAt: new Date(),
      })
      .where(eq(chapters.id, chapterId));

    // Mark entire book as failed
    await orchestrator.markBookFailed(bookId, `Chapter ${chapterId} failed: ${error}`);
    throw error;
  }
}
