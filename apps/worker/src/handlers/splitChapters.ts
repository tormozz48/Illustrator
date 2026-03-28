import { CHAPTER_SPLIT_PROMPT, ChapterSplitResponseSchema } from '@illustrator/shared/ai';
import { books, chapters } from '@illustrator/shared/db';
import type { SplitChaptersPayload } from '@illustrator/shared/jobs';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { orchestrator } from '../orchestrator.js';
import { callGroq } from '../services/groq.js';
import { downloadFromR2, extractR2Key } from '../services/storage.js';

/**
 * Stage 1: Split uploaded book into chapters
 * Triggered by: POST /api/upload completion
 * Next stage: generateStyleBible
 */
export async function handleSplitChapters(job: Job<SplitChaptersPayload>) {
  const { bookId, fileUrl } = job.data;

  logger.info({ bookId, jobId: job.id }, 'Starting chapter split');

  try {
    // Download book file from R2
    const fileKey = extractR2Key(fileUrl);
    const fileBuffer = await downloadFromR2(fileKey);
    const bookText = fileBuffer.toString('utf-8');

    // Call Groq to split chapters
    const result = await callGroq(CHAPTER_SPLIT_PROMPT(bookText), (data) =>
      ChapterSplitResponseSchema.parse(data)
    );

    // Insert chapters into database
    const chapterRecords = result.chapters.map((chapter) => ({
      bookId,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      content: chapter.content,
      status: 'pending' as const,
    }));

    const createdChapters = await db.insert(chapters).values(chapterRecords).returning();

    // Update book with expected chapter count
    await db
      .update(books)
      .set({
        expectedChapters: String(createdChapters.length),
        status: 'generatingBible',
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));

    logger.info({ bookId, chapterCount: createdChapters.length }, 'Chapter split completed');

    // Trigger next stage: generate style bible
    await orchestrator.onSplitComplete(bookId, bookText, createdChapters);
  } catch (error) {
    logger.error({ bookId, error }, 'Chapter split failed');
    await orchestrator.markBookFailed(bookId, `Chapter split failed: ${error}`);
    throw error;
  }
}
