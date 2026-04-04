import type { BookRow } from '../types.js';

export async function insertBook(
  db: D1Database,
  params: { id: string; title: string; author: string | null; r2Key: string }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO books (id, title, author, status, r2_key, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
    )
    .bind(params.id, params.title, params.author, params.r2Key)
    .run();
}

export async function listBooks(db: D1Database): Promise<BookRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, author, status, error_msg, created_at, updated_at
       FROM books ORDER BY created_at DESC LIMIT 50`
    )
    .all<BookRow>();
  return results;
}

export async function getBook(db: D1Database, id: string): Promise<BookRow | null> {
  return db
    .prepare(
      `SELECT id, title, author, status, error_msg, created_at, updated_at
       FROM books WHERE id = ?`
    )
    .bind(id)
    .first<BookRow>();
}

export async function getBookReadInfo(
  db: D1Database,
  id: string
): Promise<{ status: string; html_r2_key: string | null } | null> {
  return db
    .prepare('SELECT status, html_r2_key FROM books WHERE id = ?')
    .bind(id)
    .first<{ status: string; html_r2_key: string | null }>();
}

export async function getBookR2Keys(
  db: D1Database,
  id: string
): Promise<{ r2_key: string | null; html_r2_key: string | null } | null> {
  return db
    .prepare('SELECT r2_key, html_r2_key FROM books WHERE id = ?')
    .bind(id)
    .first<{ r2_key: string | null; html_r2_key: string | null }>();
}

export async function getBookMeta(
  db: D1Database,
  id: string
): Promise<{ title: string; author: string | null } | null> {
  return db
    .prepare('SELECT title, author FROM books WHERE id = ?')
    .bind(id)
    .first<{ title: string; author: string | null }>();
}

export async function updateBookStatus(
  db: D1Database,
  id: string,
  status: string,
  errorMsg?: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE books SET status = ?, error_msg = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(status, errorMsg ?? null, id)
    .run();
}

export async function markBookDone(db: D1Database, id: string, htmlR2Key: string): Promise<void> {
  await db
    .prepare(
      `UPDATE books
       SET status = 'done', html_r2_key = ?, error_msg = NULL, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(htmlR2Key, id)
    .run();
}

export async function deleteBook(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM books WHERE id = ?').bind(id).run();
}
