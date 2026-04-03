import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { books } from './api/books.js';
import { chapters } from './api/chapters.js';
import { handleQueue } from './queue.js';
import type { Env, IllustrateJobMessage } from './types.js';
import type { ExportedHandler } from '@cloudflare/workers-types';

export { IllustrateBookWorkflow } from './workflow/index.js';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
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

app.route('/api/books', books);
app.route('/api/books/:id/chapters', chapters);

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// fetch and queue must be on the default export for Cloudflare Queues to discover the consumer
export default {
  fetch: app.fetch.bind(app),
  queue: handleQueue,
} satisfies ExportedHandler<Env, IllustrateJobMessage>;
