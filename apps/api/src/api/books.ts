import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, BookRow } from '../types.js';

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

  // Insert book row
  await c.env.DB.prepare(
    `INSERT INTO books (id, title, author, status, r2_key, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
  )
    .bind(bookId, derivedTitle, author ?? null, r2Key)
    .run();

  // Push to queue (the queue consumer will start the Workflow)
  await c.env.ILLUSTRATE_QUEUE.send({ bookId, r2Key });

  return c.json({ id: bookId, title: derivedTitle, status: 'pending' }, 201);
});

// ── GET /api/books ───────────────────────────────────────────────────────────
books.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, author, status, error_msg, created_at, updated_at
     FROM books ORDER BY created_at DESC LIMIT 50`
  ).all<BookRow>();

  return c.json(results);
});

// ── GET /api/books/:id ───────────────────────────────────────────────────────
books.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, title, author, status, error_msg, created_at, updated_at
     FROM books WHERE id = ?`
  )
    .bind(id)
    .first<BookRow>();

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
    return new Response(cached, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const row = await c.env.DB.prepare(
    `SELECT status, html_r2_key FROM books WHERE id = ?`
  )
    .bind(id)
    .first<{ status: string; html_r2_key: string | null }>();

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

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ── DELETE /api/books/:id ────────────────────────────────────────────────────
books.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT r2_key, html_r2_key FROM books WHERE id = ?`
  )
    .bind(id)
    .first<{ r2_key: string | null; html_r2_key: string | null }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  // Delete R2 objects (best-effort)
  const keysToDelete: string[] = [];
  if (row.r2_key) keysToDelete.push(row.r2_key);
  if (row.html_r2_key) keysToDelete.push(row.html_r2_key);

  // Also delete chapter images
  const { results: illRows } = await c.env.DB.prepare(
    `SELECT il.r2_key FROM illustrations il
     JOIN chapters ch ON ch.id = il.chapter_id
     WHERE ch.book_id = ?`
  )
    .bind(id)
    .all<{ r2_key: string }>();

  for (const il of illRows) keysToDelete.push(il.r2_key);

  await Promise.allSettled(
    keysToDelete.map((k) => c.env.BOOKS_BUCKET.delete(k))
  );

  // Cascade deletes handle DB cleanup (FK ON DELETE CASCADE)
  await c.env.DB.prepare(`DELETE FROM books WHERE id = ?`).bind(id).run();

  // Invalidate KV cache
  await c.env.CACHE.delete(`html:${id}`);

  return c.json({ deleted: true });
});

export { books };
