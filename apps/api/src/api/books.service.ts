import { nanoid } from 'nanoid';
import {
  deleteBook,
  getBook,
  getBookMeta,
  getBookProgress,
  getBookR2Keys,
  insertBook,
  listBooks,
  markBookDone,
  updateBookStatus,
} from '../db/book.db.js';
import { listChaptersForNewAssemble } from '../db/chapter.db.js';
import { listIllustrationR2KeysByBook } from '../db/illustration.db.js';
import { getSelectedScenesForChapter } from '../db/scene.db.js';
import { listVariantR2KeysByBook } from '../db/scene.db.js';
import { getLogger } from '../logger.js';
import type { Env } from '../types.js';

export { listBooks, getBook, getBookProgress };

export async function uploadBook({
  env,
  file,
  title,
  author,
}: {
  env: Pick<Env, 'DB' | 'BOOKS_BUCKET' | 'ILLUSTRATE_QUEUE'>;
  file: File;
  title: string | null;
  author: string | null;
}): Promise<{ id: string; title: string }> {
  const bookId = nanoid(10);
  const r2Key = `books/${bookId}/source.txt`;
  const derivedTitle = title || file.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' ');

  const buffer = await file.arrayBuffer();
  await env.BOOKS_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });

  await insertBook(env.DB, { id: bookId, title: derivedTitle, author: author ?? null, r2Key });
  await env.ILLUSTRATE_QUEUE.send({ bookId, r2Key });

  getLogger().info('api.book.upload', {
    bookId,
    title: derivedTitle,
    fileSizeBytes: file.size,
    r2Key,
  });

  return { id: bookId, title: derivedTitle };
}

// ── Reader data ────────────────────────────────────────────────────────────────

export interface ReaderIllustration {
  insertAfterParagraph: number;
  imageUrl: string;
}

export interface ReaderChapter {
  number: number;
  title: string;
  content: string;
  illustrations: ReaderIllustration[];
}

export interface ReaderData {
  id: string;
  title: string;
  author: string | null;
  chapters: ReaderChapter[];
}

export async function getBookReaderData({
  db,
  bookId,
  apiBase = '',
}: {
  db: D1Database;
  bookId: string;
  apiBase?: string;
}): Promise<ReaderData | null> {
  const bookRow = await getBookMeta(db, bookId);
  if (!bookRow) return null;

  const chapterRows = await listChaptersForNewAssemble(db, bookId);
  const chapters: ReaderChapter[] = [];

  for (const ch of chapterRows) {
    const selectedScenes = await getSelectedScenesForChapter(db, ch.id);
    const illustrations: ReaderIllustration[] = [];

    for (const scene of selectedScenes) {
      if (scene.variant_id != null) {
        illustrations.push({
          insertAfterParagraph: scene.insert_after_para,
          imageUrl: `${apiBase}/api/books/${bookId}/chapters/variants/${scene.variant_id}/img`,
        });
      }
    }

    chapters.push({
      number: ch.number,
      title: ch.title,
      content: ch.content,
      illustrations,
    });
  }

  return {
    id: bookId,
    title: bookRow.title,
    author: bookRow.author ?? null,
    chapters,
  };
}

// ── Publish ────────────────────────────────────────────────────────────────────

export async function publishBook({
  env,
  id,
}: {
  env: Pick<Env, 'DB' | 'CACHE'>;
  id: string;
}): Promise<void> {
  await updateBookStatus(env.DB, id, 'publishing');

  try {
    await markBookDone(env.DB, id);
    await env.CACHE.delete(`html:${id}`);
    getLogger().info('api.book.published', { bookId: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateBookStatus(env.DB, id, 'error', msg);
    throw err;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function removeBook({
  env,
  id,
}: {
  env: Pick<Env, 'DB' | 'BOOKS_BUCKET' | 'CACHE'>;
  id: string;
}): Promise<boolean> {
  const row = await getBookR2Keys(env.DB, id);
  if (!row) return false;

  const keysToDelete: string[] = [];
  if (row.r2_key) keysToDelete.push(row.r2_key);
  if (row.html_r2_key) keysToDelete.push(row.html_r2_key);

  const illRows = await listIllustrationR2KeysByBook(env.DB, id);
  for (const il of illRows) keysToDelete.push(il.r2_key);

  const variantRows = await listVariantR2KeysByBook(env.DB, id);
  for (const v of variantRows) keysToDelete.push(v.r2_key);

  await Promise.allSettled(keysToDelete.map((k) => env.BOOKS_BUCKET.delete(k)));
  await deleteBook(env.DB, id);
  await env.CACHE.delete(`html:${id}`);

  return true;
}
