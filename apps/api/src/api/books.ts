import { Hono } from 'hono';
import { getLogger } from '../logger.js';
import type { Env } from '../types.js';
import {
  getBook,
  getBookHtml,
  getBookProgress,
  listBooks,
  publishBook,
  removeBook,
  uploadBook,
} from './books.service.js';

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

  const result = await uploadBook({ env: ctx.env, file: uploadedFile, title, author });
  return ctx.json({ id: result.id, title: result.title, status: 'pending' }, 201);
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
  const result = await getBookHtml({ env: ctx.env, id });

  if (result.kind === 'not_found') return ctx.json({ error: 'Not found' }, 404);
  if (result.kind === 'not_ready')
    return ctx.json({ error: 'Book not ready yet', status: result.status }, 409);
  if (result.kind === 'missing') return ctx.json({ error: 'HTML not found in storage' }, 500);

  return new Response(result.html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// ── GET /api/books/:id/progress ─────────────────────────────────────────────
books.get('/:id/progress', async (ctx) => {
  const id = ctx.req.param('id');
  const progress = await getBookProgress(ctx.env.DB, id);
  if (!progress) {
    return ctx.json({ error: 'Not found' }, 404);
  }
  return ctx.json(progress);
});

// ── POST /api/books/:id/publish ──────────────────────────────────────────────
books.post('/:id/publish', async (ctx) => {
  const id = ctx.req.param('id');

  const progress = await getBookProgress(ctx.env.DB, id);
  if (!progress) {
    return ctx.json({ error: 'Book not found' }, 404);
  }

  if (
    progress.draft_chapters > 0 ||
    progress.editing_chapters > 0 ||
    progress.total_chapters === 0
  ) {
    return ctx.json({ error: 'All chapters must be illustrated before publishing', progress }, 409);
  }

  try {
    const { htmlR2Key } = await publishBook({ env: ctx.env, id });
    return ctx.json({ html_r2_key: htmlR2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().error('api.book.publishFailed', { bookId: id, error: msg });
    return ctx.json({ error: 'Publish failed', details: msg }, 500);
  }
});

// ── DELETE /api/books/:id ────────────────────────────────────────────────────
books.delete('/:id', async (ctx) => {
  const id = ctx.req.param('id');
  const deleted = await removeBook({ env: ctx.env, id });
  if (!deleted) {
    return ctx.json({ error: 'Not found' }, 404);
  }
  return ctx.json({ deleted: true });
});

export { books };
