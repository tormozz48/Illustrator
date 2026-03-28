import { books, chapters } from '@illustrator/shared/db';
import type { ChapterInsert, ChapterUpdate } from '@illustrator/shared/db';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../types.js';

/**
 * Chapters data access layer
 * ONLY queries — no business logic, no side effects
 */

export async function findChapterById(db: Database, chapterId: string) {
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  return chapter ?? null;
}

export async function findChaptersByBookId(db: Database, bookId: string) {
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.bookId, bookId))
    .orderBy(chapters.chapterNumber);
}

/**
 * Find chapter with ownership check (via book.userId)
 */
export async function findUserChapter(db: Database, chapterId: string, userId: string) {
  const [chapter] = await db
    .select({
      chapter: chapters,
      book: books,
    })
    .from(chapters)
    .innerJoin(books, eq(chapters.bookId, books.id))
    .where(and(eq(chapters.id, chapterId), eq(books.userId, userId)))
    .limit(1);

  return chapter ? chapter.chapter : null;
}

export async function createChapter(db: Database, data: ChapterInsert) {
  const [chapter] = await db.insert(chapters).values(data).returning();
  return chapter;
}

export async function createManyChapters(db: Database, data: ChapterInsert[]) {
  return db.insert(chapters).values(data).returning();
}

export async function updateChapter(db: Database, chapterId: string, data: ChapterUpdate) {
  const [chapter] = await db
    .update(chapters)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId))
    .returning();
  return chapter ?? null;
}
