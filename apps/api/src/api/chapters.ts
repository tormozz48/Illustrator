import { Hono } from 'hono';
import type { Env } from '../types.js';
import {
  editChapter,
  generateVariants,
  getChapterDetail,
  getVariantById,
  listChaptersForGrid,
  saveChapter,
} from './chapters.service.js';

const chapters = new Hono<{ Bindings: Env }>();

// ── GET /api/books/:id/chapters ──────────────────────────────────────────────
chapters.get('/', async (ctx) => {
  const bookId = ctx.req.param('id');
  if (!bookId) {
    return ctx.json({ error: 'Missing book id' }, 400);
  }
  const results = await listChaptersForGrid(ctx.env.DB, bookId);
  return ctx.json(results);
});

// ── GET /api/books/:id/chapters/variants/:variantId/img ─────────────────────
// Must come before /:num route to match correctly
chapters.get('/variants/:variantId/img', async (ctx) => {
  const bookId = ctx.req.param('id');
  const variantId = Number.parseInt(ctx.req.param('variantId') ?? '', 10);

  if (!bookId || Number.isNaN(variantId)) {
    return ctx.json({ error: 'Invalid book id or variant id' }, 400);
  }

  const variant = await getVariantById(ctx.env.DB, variantId);
  if (!variant) {
    return ctx.json({ error: 'Variant not found' }, 404);
  }

  const obj = await ctx.env.BOOKS_BUCKET.get(variant.r2_key);
  if (!obj) {
    return ctx.json({ error: 'Image missing from storage' }, 500);
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (obj.size) {
    headers.set('Content-Length', String(obj.size));
  }

  return new Response(obj.body, { headers });
});

// ── GET /api/books/:id/chapters/:num ─────────────────────────────────────────
chapters.get('/:num', async (ctx) => {
  const bookId = ctx.req.param('id');
  const num = Number.parseInt(ctx.req.param('num') ?? '', 10);

  if (!bookId || Number.isNaN(num)) {
    return ctx.json({ error: 'Invalid book id or chapter number' }, 400);
  }

  const chapter = await getChapterDetail({ db: ctx.env.DB, bookId, num });
  if (!chapter) {
    return ctx.json({ error: 'Chapter not found' }, 404);
  }

  return ctx.json(chapter);
});

// ── POST /api/books/:id/chapters/:num/generate ───────────────────────────────
// Returns an SSE stream: each variant is emitted as it's generated.
// Events: { type: 'variant', scene_id, variant } | { type: 'scene_done', scene_id } | { type: 'done' } | { type: 'error', message }
chapters.post('/:num/generate', async (ctx) => {
  const bookId = ctx.req.param('id');
  const num = Number.parseInt(ctx.req.param('num') ?? '', 10);

  if (!bookId || Number.isNaN(num)) {
    return ctx.json({ error: 'Invalid book id or chapter number' }, 400);
  }

  const body = await ctx.req.json<{ scene_ids: number[]; variant_count: number }>();
  const { scene_ids, variant_count } = body;

  if (
    !Array.isArray(scene_ids) ||
    !Number.isInteger(variant_count) ||
    variant_count < 1 ||
    variant_count > 4
  ) {
    return ctx.json({ error: 'Invalid request body' }, 400);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const sendEvent = (data: unknown) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  // Run generation asynchronously; Worker stays alive while stream is open
  (async () => {
    try {
      const result = await generateVariants({
        env: ctx.env,
        bookId,
        num,
        sceneIds: scene_ids,
        variantCount: variant_count,
        onVariant: async (sceneId, variant) => {
          await sendEvent({ type: 'variant', scene_id: sceneId, variant });
        },
        onSceneDone: async (sceneId) => {
          await sendEvent({ type: 'scene_done', scene_id: sceneId });
        },
      });

      if (result.kind === 'chapter_not_found') {
        await sendEvent({ type: 'error', message: 'Chapter not found' });
      } else if (result.kind === 'bible_not_found') {
        await sendEvent({ type: 'error', message: 'Bible not found' });
      } else {
        await sendEvent({ type: 'done' });
      }
    } catch (err) {
      await sendEvent({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
});

// ── POST /api/books/:id/chapters/:num/save ──────────────────────────────────
chapters.post('/:num/save', async (ctx) => {
  const bookId = ctx.req.param('id');
  const num = Number.parseInt(ctx.req.param('num') ?? '', 10);

  if (!bookId || Number.isNaN(num)) {
    return ctx.json({ error: 'Invalid book id or chapter number' }, 400);
  }

  const body = await ctx.req.json<{
    selections: Array<{ scene_id: number; variant_id: number | null }>;
  }>();
  const { selections } = body;

  if (!Array.isArray(selections)) {
    return ctx.json({ error: 'Invalid request body' }, 400);
  }

  const chapter = await saveChapter({ env: ctx.env, bookId, num, selections });
  if (!chapter) {
    return ctx.json({ error: 'Chapter not found' }, 404);
  }

  return ctx.json(chapter);
});

// ── POST /api/books/:id/chapters/:num/edit ──────────────────────────────────
chapters.post('/:num/edit', async (ctx) => {
  const bookId = ctx.req.param('id');
  const num = Number.parseInt(ctx.req.param('num') ?? '', 10);

  if (!bookId || Number.isNaN(num)) {
    return ctx.json({ error: 'Invalid book id or chapter number' }, 400);
  }

  const chapter = await editChapter({ env: ctx.env, bookId, num });
  if (!chapter) {
    return ctx.json({ error: 'Chapter not found' }, 404);
  }

  return ctx.json(chapter);
});

export { chapters };
