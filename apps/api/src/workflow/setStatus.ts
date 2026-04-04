import { updateBookStatus } from '../db/book.db.js';

export function makeSetStatus(DB: D1Database, bookId: string) {
  return (status: string, errorMsg?: string) => updateBookStatus(DB, bookId, status, errorMsg);
}
