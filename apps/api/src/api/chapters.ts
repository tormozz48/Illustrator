import { Hono } from 'hono';
import type { Env, ChapterRow, AnchorRow, IllustrationRow } from '../types.js';

const chapters = new Hono<{ Bindings: Env }>();

// ── GET /api/books/:id/chapters ──────────────────────────────────────────────
chapters.get('/', async (c) => {
  const bookId = c.req.param('id');

  const { results } = await c.env.DB.prepare(
    `SELECT ch.id, ch.number, ch.title,
            an.insert_after_para,
            CASE WHEN il.chapter_id IS NOT NULL THEN 1 ELSE 0 END AS has_illustration
     FROM chapters ch
     LEFT JOIN anchors an ON an.chapter_id = ch.id
     LEFT JOIN illustrations il ON il.chapter_id = ch.id
     WHERE ch.book_id = ?
     ORDER BY ch.number`
  )
    .bind(bookId)
    .all<{
      id: number;
      number: number;
      title: string;
      insert_after_para: number | null;
      has_illustration: number;
    }>();

  return c.json(results);
});

// ── GET /api/books/:id/chapters/:num/img ─────────────────────────────────────
// Streams the illustration image for a chapter directly from R2.
chapters.get('/:num/img', async (c) => {
  const bookId = c.req.param('id');
  const num = parseInt(c.req.param('num'), 10);

  if (Number.isNaN(num)) return c.json({ error: 'Invalid chapter number' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT il.r2_key
     FROM illustrations il
     JOIN chapters ch ON ch.id = il.chapter_id
     WHERE ch.book_id = ? AND ch.number = ?`
  )
    .bind(bookId, num)
    .first<{ r2_key: string }>();

  if (!row) return c.json({ error: 'Illustration not found' }, 404);

  const obj = await c.env.BOOKS_BUCKET.get(row.r2_key);
  if (!obj) return c.json({ error: 'Image missing from storage' }, 500);

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/webp');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (obj.size) headers.set('Content-Length', String(obj.size));

  return new Response(obj.body, { headers });
});

export { chapters };
