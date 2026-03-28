import { books } from '@illustrator/shared/db';
import type { ChapterSelect } from '@illustrator/shared/db';
import { JOB_NAMES } from '@illustrator/shared/jobs';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { db } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Orchestrator manages state transitions between processing stages
 * Handles the multi-stage pipeline: split → bible → illustrate → assemble
 */
class Orchestrator {
  private queue: Queue;

  constructor() {
    const connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('book-processing', { connection });
  }

  /**
   * Stage 1 → 2: After chapters are split, generate style bible
   */
  async onSplitComplete(bookId: string, fullText: string, chapters: ChapterSelect[]) {
    logger.info({ bookId, chapterCount: chapters.length }, 'Dispatching style bible generation');

    const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);

    if (!book) {
      throw new Error('Book not found');
    }

    await this.queue.add(JOB_NAMES.GENERATE_STYLE_BIBLE, {
      bookId,
      bookTitle: book.title,
      fullText,
    });
  }

  /**
   * Stage 2 → 3: After style bible is generated, fan-out to process all chapters
   */
  async onStyleBibleComplete(bookId: string, chapterIds: string[]) {
    logger.info(
      { bookId, chapterCount: chapterIds.length },
      'Dispatching chapter processing (fan-out)'
    );

    const jobs = chapterIds.map((chapterId) => ({
      name: JOB_NAMES.PROCESS_CHAPTER,
      data: { bookId, chapterId },
    }));

    await this.queue.addBulk(jobs);
  }

  /**
   * Stage 3 → 4: After each chapter completes, check if all are done
   * Uses atomic counter to trigger final assembly
   */
  async onChapterComplete(bookId: string) {
    // Atomic increment and read
    const [result] = await db
      .update(books)
      .set({
        completedChapters: String(
          Number(
            (await db.select().from(books).where(eq(books.id, bookId)).limit(1))[0]
              ?.completedChapters ?? '0'
          ) + 1
        ),
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId))
      .returning({
        completedChapters: books.completedChapters,
        expectedChapters: books.expectedChapters,
      });

    if (!result) {
      throw new Error('Failed to update chapter count');
    }

    const completed = Number(result.completedChapters);
    const expected = Number(result.expectedChapters);

    logger.info({ bookId, completed, expected }, 'Chapter completed');

    // If all chapters are done, trigger assembly
    if (completed >= expected) {
      logger.info({ bookId }, 'All chapters complete, dispatching assembly');

      await this.queue.add(JOB_NAMES.ASSEMBLE_BOOK, { bookId });
    }
  }

  /**
   * Mark book as failed (can be called from any stage)
   */
  async markBookFailed(bookId: string, errorMessage: string) {
    logger.error({ bookId, errorMessage }, 'Marking book as failed');

    await db
      .update(books)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));
  }
}

/**
 * Singleton orchestrator instance
 */
export const orchestrator = new Orchestrator();
