export async function upsertIllustration(
  db: D1Database,
  params: {
    chapterId: number;
    r2Key: string;
    width: number;
    height: number;
    bytes: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO illustrations
       (chapter_id, r2_key, width, height, bytes, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(params.chapterId, params.r2Key, params.width, params.height, params.bytes)
    .run();
}

export async function getIllustrationR2Key(
  db: D1Database,
  bookId: string,
  chapterNumber: number
): Promise<{ r2_key: string } | null> {
  return db
    .prepare(
      `SELECT il.r2_key
       FROM illustrations il
       JOIN chapters ch ON ch.id = il.chapter_id
       WHERE ch.book_id = ? AND ch.number = ?`
    )
    .bind(bookId, chapterNumber)
    .first<{ r2_key: string }>();
}

export async function listIllustrationR2KeysByBook(
  db: D1Database,
  bookId: string
): Promise<{ r2_key: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT il.r2_key FROM illustrations il
       JOIN chapters ch ON ch.id = il.chapter_id
       WHERE ch.book_id = ?`
    )
    .bind(bookId)
    .all<{ r2_key: string }>();
  return results;
}
