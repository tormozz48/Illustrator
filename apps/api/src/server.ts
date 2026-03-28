import 'express-async-errors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import { db } from './db.js';
import { env } from './env.js';
import { httpLogger, logger } from './logger.js';
import { auth, requireAuth } from './middleware/auth.js';
import { bookQueue } from './queue.js';
import { appRouter } from './router.js';
import { handleProgress } from './routes/progress.js';
import { handleUpload, uploadMiddleware } from './routes/upload.js';
import { createContext } from './trpc.js';

const app = express();

// Store globals for route access
app.locals.db = db;
app.locals.queue = bookQueue;

// Middleware
app.use(cors());
app.use(express.json());
app.use(httpLogger);

// Auth middleware (applies to all routes)
app.use(auth);

// Health check (unauthenticated)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// tRPC endpoint (authenticated via context)
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// File upload endpoint (authenticated)
app.post('/api/upload', requireAuth, uploadMiddleware, handleUpload);

// SSE progress endpoint (public - can monitor any book)
app.get('/api/progress/:bookId', handleProgress);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = env.PORT;
app.listen(PORT, () => {
  logger.info(`API server listening on port ${PORT}`);
});
