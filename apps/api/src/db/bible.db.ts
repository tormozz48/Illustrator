export async function upsertBible(db: D1Database, bookId: string, data: object): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO bibles (book_id, data, created_at)
       VALUES (?, ?, datetime('now'))`
    )
    .bind(bookId, JSON.stringify(data))
    .run();
}

export async function getBible(db: D1Database, bookId: string): Promise<{ data: string } | null> {
  return db
    .prepare('SELECT data FROM bibles WHERE book_id = ?')
    .bind(bookId)
    .first<{ data: string }>();
}
