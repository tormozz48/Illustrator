import type { Queue } from 'bullmq';
import {
  JOB_NAMES,
  type ProcessChapterPayload,
  ProcessChapterPayloadSchema,
} from '@illustrator/shared/jobs';

/**
 * Chapter job dispatch layer
 * Type-safe job creation using shared contracts
 */

export async function dispatchProcessChapter(
  queue: Queue,
  payload: ProcessChapterPayload
) {
  const validated = ProcessChapterPayloadSchema.parse(payload);
  await queue.add(JOB_NAMES.PROCESS_CHAPTER, validated);
}

/**
 * Fan-out: dispatch processChapter for all chapters in a book
 */
export async function dispatchProcessAllChapters(
  queue: Queue,
  bookId: string,
  chapterIds: string[]
) {
  const jobs = chapterIds.map((chapterId) => ({
    name: JOB_NAMES.PROCESS_CHAPTER,
    data: ProcessChapterPayloadSchema.parse({ bookId, chapterId }),
  }));

  await queue.addBulk(jobs);
}
