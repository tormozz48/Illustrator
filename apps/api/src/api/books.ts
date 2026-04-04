import { getLogger } from '@illustrator/core';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';

import {
  deleteBook,
  getBook,
  getBookR2Keys,
  getBookReadInfo,
  insertBook,
  listBooks,
} from '../db/book.db.js';
import { listIllustrationR2KeysByBook } from '../db/illustration.db.js';
import type { Env } from '../types.js';

const books = new Hono<{ Bindings: Env }>();

// ── POST /api/books ─────────────────────────────────────────────────────────
// Upload a .txt file and enqueue an illustration job.
books.post('/', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const form = await c.req.formData();
  const file = form.get('file');
  const title = (form.get('title') as string | null)?.trim() || null;
  const author = (form.get('author') as string | null)?.trim() || null;

  // FormDataEntryValue is string | File. Reject plain string values.
  if (!file || typeof file === 'string') {
    return c.json({ error: 'Missing file field' }, 400);
  }
  const uploadedFile = file as File;
  if (!uploadedFile.name.endsWith('.txt')) {
    return c.json({ error: 'Only .txt files are supported' }, 400);
  }
  if (uploadedFile.size > 10 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 10 MB)' }, 400);
  }

  const bookId = nanoid(10);
  const r2Key = `books/${bookId}/source.txt`;

  // Derive title from filename if not provided
  const derivedTitle =
    title || uploadedFile.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' ');

  // Upload raw text to R2
  const buffer = await uploadedFile.arrayBuffer();
  await c.env.BOOKS_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });

  await insertBook(c.env.DB, { id: bookId, title: derivedTitle, author: author ?? null, r2Key });

  // Push to queue (the queue consumer will start the Workflow)
  await c.env.ILLUSTRATE_QUEUE.send({ bookId, r2Key });

  getLogger().info('api.book.upload', {
    bookId,
    title: derivedTitle,
    fileSizeBytes: uploadedFile.size,
    r2Key,
  });

  return c.json({ id: bookId, title: derivedTitle, status: 'pending' }, 201);
});

// ── GET /api/books ───────────────────────────────────────────────────────────
books.get('/', async (c) => {
  return c.json(await listBooks(c.env.DB));
});

// ── GET /api/books/:id ───────────────────────────────────────────────────────
books.get('/:id', async (c) => {
  const row = await getBook(c.env.DB, c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// ── GET /api/books/:id/read ──────────────────────────────────────────────────
// Returns the assembled HTML reader (served from R2 or cached in KV).
books.get('/:id/read', async (c) => {
  const id = c.req.param('id');

  // Try KV cache first (TTL: 1 hour)
  const cacheKey = `html:${id}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    getLogger().info('api.book.read.cacheHit', { bookId: id });
    return new Response(cached, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const row = await getBookReadInfo(c.env.DB, id);
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.status !== 'done') {
    return c.json({ error: 'Book not ready yet', status: row.status }, 409);
  }
  if (!row.html_r2_key) {
    return c.json({ error: 'HTML not found in storage' }, 500);
  }

  const obj = await c.env.BOOKS_BUCKET.get(row.html_r2_key);
  if (!obj) return c.json({ error: 'HTML object missing from R2' }, 500);

  const html = await obj.text();

  // Cache for 1 hour
  await c.env.CACHE.put(cacheKey, html, { expirationTtl: 3600 });
  getLogger().info('api.book.read.cacheMiss', { bookId: id });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ── DELETE /api/books/:id ────────────────────────────────────────────────────
books.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const row = await getBookR2Keys(c.env.DB, id);
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Delete R2 objects (best-effort)
  const keysToDelete: string[] = [];
  if (row.r2_key) keysToDelete.push(row.r2_key);
  if (row.html_r2_key) keysToDelete.push(row.html_r2_key);

  const illRows = await listIllustrationR2KeysByBook(c.env.DB, id);
  for (const il of illRows) keysToDelete.push(il.r2_key);

  await Promise.allSettled(
    keysToDelete.map((k) => c.env.BOOKS_BUCKET.delete(k))
  );

  // Cascade deletes handle DB cleanup (FK ON DELETE CASCADE)
  await deleteBook(c.env.DB, id);

  // Invalidate KV cache
  await c.env.CACHE.delete(`html:${id}`);

  return c.json({ deleted: true });
});

export { books };
