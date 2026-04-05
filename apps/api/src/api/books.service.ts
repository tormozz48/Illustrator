import { nanoid } from 'nanoid';
import {
  deleteBook,
  getBook,
  getBookProgress,
  getBookR2Keys,
  getBookReadInfo,
  insertBook,
  listBooks,
  markBookDone,
  updateBookStatus,
} from '../db/book.db.js';
import { listIllustrationR2KeysByBook } from '../db/illustration.db.js';
import { listVariantR2KeysByBook } from '../db/scene.db.js';
import { getLogger } from '../logger.js';
import type { Env } from '../types.js';
import { assembleNewStep } from '../workflow/assemble.step.js';

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

export type BookHtmlResult =
  | { kind: 'ok'; html: string }
  | { kind: 'not_found' }
  | { kind: 'not_ready'; status: string }
  | { kind: 'missing' };

export async function getBookHtml({
  env,
  id,
}: {
  env: Pick<Env, 'DB' | 'BOOKS_BUCKET' | 'CACHE'>;
  id: string;
}): Promise<BookHtmlResult> {
  const cacheKey = `html:${id}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    getLogger().info('api.book.read.cacheHit', { bookId: id });
    return { kind: 'ok', html: cached };
  }

  const row = await getBookReadInfo(env.DB, id);
  if (!row) return { kind: 'not_found' };
  if (row.status !== 'done') return { kind: 'not_ready', status: row.status };
  if (!row.html_r2_key) return { kind: 'missing' };

  const obj = await env.BOOKS_BUCKET.get(row.html_r2_key);
  if (!obj) return { kind: 'missing' };

  const html = await obj.text();
  await env.CACHE.put(cacheKey, html, { expirationTtl: 3600 });
  getLogger().info('api.book.read.cacheMiss', { bookId: id });

  return { kind: 'ok', html };
}

export async function publishBook({
  env,
  id,
}: {
  env: Pick<Env, 'DB' | 'BOOKS_BUCKET' | 'CACHE'>;
  id: string;
}): Promise<{ htmlR2Key: string }> {
  await updateBookStatus(env.DB, id, 'publishing');

  try {
    const htmlR2Key = await assembleNewStep({
      bookId: id,
      DB: env.DB,
      BOOKS_BUCKET: env.BOOKS_BUCKET,
    });

    await markBookDone(env.DB, id, htmlR2Key);
    await env.CACHE.delete(`html:${id}`);
    getLogger().info('api.book.published', { bookId: id, htmlR2Key });

    return { htmlR2Key };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateBookStatus(env.DB, id, 'error', msg);
    throw err;
  }
}

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
