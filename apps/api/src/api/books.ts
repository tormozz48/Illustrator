import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getLogger } from '../logger.js';

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
books.post('/', async (ctx) => {
  const contentType = ctx.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return ctx.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const form = await ctx.req.formData();
  const file = form.get('file');
  const title = (form.get('title') as string | null)?.trim() || null;
  const author = (form.get('author') as string | null)?.trim() || null;

  // FormDataEntryValue is string | File. Reject plain string values.
  if (!file || typeof file === 'string') {
    return ctx.json({ error: 'Missing file field' }, 400);
  }
  const uploadedFile = file as File;
  if (!uploadedFile.name.endsWith('.txt')) {
    return ctx.json({ error: 'Only .txt files are supported' }, 400);
  }
  if (uploadedFile.size > 10 * 1024 * 1024) {
    return ctx.json({ error: 'File too large (max 10 MB)' }, 400);
  }

  const bookId = nanoid(10);
  const r2Key = `books/${bookId}/source.txt`;

  // Derive title from filename if not provided
  const derivedTitle = title || uploadedFile.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' ');

  // Upload raw text to R2
  const buffer = await uploadedFile.arrayBuffer();
  await ctx.env.BOOKS_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });

  await insertBook(ctx.env.DB, {
    id: bookId,
    title: derivedTitle,
    author: author ?? null,
    r2Key,
  });

  // Push to queue (the queue consumer will start the Workflow)
  await ctx.env.ILLUSTRATE_QUEUE.send({ bookId, r2Key });

  getLogger().info('api.book.upload', {
    bookId,
    title: derivedTitle,
    fileSizeBytes: uploadedFile.size,
    r2Key,
  });

  return ctx.json({ id: bookId, title: derivedTitle, status: 'pending' }, 201);
});

// ── GET /api/books ───────────────────────────────────────────────────────────
books.get('/', async (ctx) => {
  return ctx.json(await listBooks(ctx.env.DB));
});

// ── GET /api/books/:id ───────────────────────────────────────────────────────
books.get('/:id', async (ctx) => {
  const row = await getBook(ctx.env.DB, ctx.req.param('id'));
  if (!row) {
    return ctx.json({ error: 'Not found' }, 404);
  }
  return ctx.json(row);
});

// ── GET /api/books/:id/read ──────────────────────────────────────────────────
// Returns the assembled HTML reader (served from R2 or cached in KV).
books.get('/:id/read', async (ctx) => {
  const id = ctx.req.param('id');

  // Try KV cache first (TTL: 1 hour)
  const cacheKey = `html:${id}`;
  const cached = await ctx.env.CACHE.get(cacheKey);
  if (cached) {
    getLogger().info('api.book.read.cacheHit', { bookId: id });
    return new Response(cached, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const row = await getBookReadInfo(ctx.env.DB, id);
  if (!row) {
    return ctx.json({ error: 'Not found' }, 404);
  }
  if (row.status !== 'done') {
    return ctx.json({ error: 'Book not ready yet', status: row.status }, 409);
  }
  if (!row.html_r2_key) {
    return ctx.json({ error: 'HTML not found in storage' }, 500);
  }

  const obj = await ctx.env.BOOKS_BUCKET.get(row.html_r2_key);
  if (!obj) {
    return ctx.json({ error: 'HTML object missing from R2' }, 500);
  }

  const html = await obj.text();

  // Cache for 1 hour
  await ctx.env.CACHE.put(cacheKey, html, { expirationTtl: 3600 });
  getLogger().info('api.book.read.cacheMiss', { bookId: id });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ── DELETE /api/books/:id ────────────────────────────────────────────────────
books.delete('/:id', async (ctx) => {
  const id = ctx.req.param('id');

  const row = await getBookR2Keys(ctx.env.DB, id);
  if (!row) {
    return ctx.json({ error: 'Not found' }, 404);
  }

  // Delete R2 objects (best-effort)
  const keysToDelete: string[] = [];
  if (row.r2_key) {
    keysToDelete.push(row.r2_key);
  }
  if (row.html_r2_key) {
    keysToDelete.push(row.html_r2_key);
  }

  const illRows = await listIllustrationR2KeysByBook(ctx.env.DB, id);
  for (const il of illRows) {
    keysToDelete.push(il.r2_key);
  }

  await Promise.allSettled(keysToDelete.map((k) => ctx.env.BOOKS_BUCKET.delete(k)));

  // Cascade deletes handle DB cleanup (FK ON DELETE CASCADE)
  await deleteBook(ctx.env.DB, id);

  // Invalidate KV cache
  await ctx.env.CACHE.delete(`html:${id}`);

  return ctx.json({ deleted: true });
});

export { books };
