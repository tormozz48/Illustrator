export async function upsertBible(db: D1Database, bookId: string, data: object): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO bibles (book_id, data, created_at)
       VALUES (?, ?, datetime('now'))`
    )
    .bind(bookId, JSON.stringify(data))
    .run();
}
