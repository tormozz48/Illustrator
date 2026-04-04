export async function insertJob(
  db: D1Database,
  id: string,
  bookId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO jobs (id, book_id, workflow_status, started_at, created_at)
       VALUES (?, ?, 'running', datetime('now'), datetime('now'))`
    )
    .bind(id, bookId)
    .run();
}

export async function markJobComplete(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE jobs SET workflow_status = 'complete', finished_at = datetime('now') WHERE id = ?`
    )
    .bind(id)
    .run();
}

export async function markJobErrored(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE jobs SET workflow_status = 'errored', finished_at = datetime('now') WHERE id = ?`
    )
    .bind(id)
    .run();
}
