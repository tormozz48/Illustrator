/**
 * Cloudflare Worker entrypoint.
 *
 * Exports:
 *   default.fetch    — Hono HTTP handler
 *   default.queue    — Queue consumer (must be on the default export object)
 *   IllustrateBookWorkflow — Cloudflare Workflow class (named export)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { books } from './api/books.js';
import { chapters } from './api/chapters.js';
import { handleQueue } from './queue.js';
import type { Env, IllustrateJobMessage } from './types.js';
import type { ExportedHandler } from '@cloudflare/workers-types';

// Re-export the Workflow so Cloudflare can find it by class_name
export { IllustrateBookWorkflow } from './workflow/index.js';

const app = new Hono<{ Bindings: Env }>();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  '/api/*',
  cors({
    // Allow any Cloudflare Pages preview/production URL and localhost dev server.
    // Hono's origin function: return the origin to allow it, null to block it.
    origin: (origin) => {
      if (!origin) return '*'; // non-browser (curl, Postman, etc.)
      if (
        origin.startsWith('http://localhost:') ||
        origin.endsWith('.pages.dev') ||
        origin.endsWith('.workers.dev')
      ) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.route('/api/books', books);
// Mount chapter routes under /api/books/:id/chapters
app.route('/api/books/:id/chapters', chapters);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Default export ────────────────────────────────────────────────────────────
// Both `fetch` and `queue` MUST live on the default export object so that
// Cloudflare Queues can discover the consumer during deployment.
export default {
  fetch: app.fetch.bind(app),
  queue: handleQueue,
} satisfies ExportedHandler<Env, IllustrateJobMessage>;
