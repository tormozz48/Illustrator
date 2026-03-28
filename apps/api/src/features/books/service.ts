import type { Queue } from 'bullmq';
import type { Database } from '../../types.js';
import * as jobs from './jobs.js';
import * as queries from './queries.js';

/**
 * Books business logic layer
 * Orchestrates queries, validates rules, dispatches jobs
 */

export async function listUserBooks(db: Database, userId: string) {
  return queries.findBooksByUserId(db, userId);
}

export async function getUserBook(db: Database, bookId: string, userId: string) {
  const book = await queries.findUserBook(db, bookId, userId);

  if (!book) {
    throw new Error('Book not found or access denied');
  }

  return book;
}

export async function createBook(
  db: Database,
  queue: Queue,
  userId: string,
  title: string,
  fileUrl: string
) {
  const book = await queries.createBook(db, {
    userId,
    title,
    originalFileUrl: fileUrl,
    status: 'splitting',
  });

  // Dispatch first stage: split chapters
  if (book) {
    await jobs.dispatchSplitChapters(queue, {
      bookId: book.id,
      fileUrl,
    });
  }

  return book;
}

export async function markBookFailed(db: Database, bookId: string, errorMessage: string) {
  return queries.updateBook(db, bookId, {
    status: 'failed',
    errorMessage,
  });
}

export async function deleteUserBook(db: Database, bookId: string, userId: string) {
  // Verify ownership
  const book = await queries.findUserBook(db, bookId, userId);

  if (!book) {
    throw new Error('Book not found or access denied');
  }

  await queries.deleteBook(db, bookId);
}
