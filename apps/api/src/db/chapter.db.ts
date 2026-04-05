import type { RawChapter } from '../schemas/index.js';

export interface ChapterWithMeta {
  id: number;
  number: number;
  title: string;
  insert_after_para: number | null;
  has_illustration: number;
}

export interface ChapterForAssemble {
  number: number;
  title: string;
  content: string;
  insert_after_para: number | null;
  has_illustration: number;
}

export async function insertChapters(
  db: D1Database,
  bookId: string,
  chapters: RawChapter[]
): Promise<void> {
  const statements = chapters.map((c) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO chapters (book_id, number, title, content, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .bind(bookId, c.number, c.title ?? '', c.content)
  );
  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function getChapterId(
  db: D1Database,
  bookId: string,
  number: number
): Promise<number | null> {
  const row = await db
    .prepare('SELECT id FROM chapters WHERE book_id = ? AND number = ?')
    .bind(bookId, number)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function listChaptersWithMeta(
  db: D1Database,
  bookId: string
): Promise<ChapterWithMeta[]> {
  const { results } = await db
    .prepare(
      `SELECT ch.id, ch.number, ch.title,
              an.insert_after_para,
              CASE WHEN il.chapter_id IS NOT NULL THEN 1 ELSE 0 END AS has_illustration
       FROM chapters ch
       LEFT JOIN anchors an ON an.chapter_id = ch.id
       LEFT JOIN illustrations il ON il.chapter_id = ch.id
       WHERE ch.book_id = ?
       ORDER BY ch.number`
    )
    .bind(bookId)
    .all<ChapterWithMeta>();
  return results;
}

export async function listChaptersForAssemble(
  db: D1Database,
  bookId: string
): Promise<ChapterForAssemble[]> {
  const { results } = await db
    .prepare(
      `SELECT ch.number, ch.title, ch.content,
              an.insert_after_para,
              CASE WHEN il.chapter_id IS NOT NULL THEN 1 ELSE 0 END AS has_illustration
       FROM chapters ch
       LEFT JOIN anchors an ON an.chapter_id = ch.id
       LEFT JOIN illustrations il ON il.chapter_id = ch.id
       WHERE ch.book_id = ?
       ORDER BY ch.number`
    )
    .bind(bookId)
    .all<ChapterForAssemble>();
  return results;
}
