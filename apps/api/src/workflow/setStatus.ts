export function makeSetStatus(DB: D1Database, bookId: string) {
  return async (status: string, errorMsg?: string) => {
    await DB.prepare(
      `UPDATE books SET status = ?, error_msg = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, errorMsg ?? null, bookId)
      .run();
  };
}
