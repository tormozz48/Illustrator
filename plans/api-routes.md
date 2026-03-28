# API Routes & tRPC Procedures

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** `apps/api/src/`  
> **Framework:** Express + tRPC v10

---

## Overview

The API uses a **hybrid routing** approach:
- **tRPC** handles all typed procedures at `/api/trpc/*`
- **Express** handles special cases: file uploads (multer) and SSE streaming

---

## Route Architecture

```
apps/api/src/
├── server.ts              # Express app setup + tRPC adapter
├── trpc.ts                # tRPC initialization, context, middleware
├── features/
│   ├── books/
│   │   ├── router.ts      # tRPC procedures (thin)
│   │   ├── service.ts     # Business logic
│   │   ├── queries.ts     # Drizzle queries
│   │   └── jobs.ts        # BullMQ dispatch
│   └── chapters/
│       ├── router.ts
│       ├── service.ts
│       └── queries.ts
├── routes/
│   ├── upload.ts          # POST /api/upload (multer)
│   └── progress.ts        # GET /api/progress/:bookId (SSE)
└── middleware/
    └── auth.ts            # Clerk JWT verification
```

---

## Express Routes (Non-tRPC)

### `POST /api/upload` — File Upload

**Why Express:** tRPC doesn't handle `multipart/form-data` natively.

```typescript
// apps/api/src/routes/upload.ts

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { uploadService } from '../features/books/service';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'));
    }
  },
});

// Request body schema
const UploadBodySchema = z.object({
  title: z.string().min(1).max(500),
});

// Response schema
const UploadResponseSchema = z.object({
  bookId: z.string().uuid(),
  status: z.literal('uploading'),
  message: z.string(),
});

router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    const { title } = UploadBodySchema.parse(req.body);
    const file = req.file;
    const userId = req.auth.userId; // From Clerk middleware
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const result = await uploadService.processUpload({
      userId,
      title,
      fileName: file.originalname,
      fileBuffer: file.buffer,
      fileSize: file.size,
    });
    
    return res.status(201).json(UploadResponseSchema.parse(result));
  },
);

export { router as uploadRouter };
```

---

### `GET /api/progress/:bookId` — SSE Progress Stream

**Why Express:** Server-Sent Events need raw HTTP streaming.

```typescript
// apps/api/src/routes/progress.ts

import { Router } from 'express';
import { QueueEvents } from 'bullmq';
import { z } from 'zod';
import { redis } from '../redis';
import { requireAuth } from '../middleware/auth';
import { bookQueries } from '../features/books/queries';

const router = Router();

const ParamsSchema = z.object({
  bookId: z.string().uuid(),
});

router.get(
  '/progress/:bookId',
  requireAuth,
  async (req, res) => {
    const { bookId } = ParamsSchema.parse(req.params);
    const userId = req.auth.userId;
    
    // Verify ownership
    const book = await bookQueries.getBook(bookId);
    if (!book || book.userId !== userId) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    // Send initial status
    sendEvent(res, 'status', {
      bookId,
      status: book.status,
      completedChapters: book.completedChapters,
      expectedChapters: book.expectedChapters,
    });
    
    // Set up BullMQ event listener
    const queueEvents = new QueueEvents('book-processing', {
      connection: redis,
    });
    
    // Listen for job progress
    const progressHandler = ({ jobId, data }: { jobId: string; data: unknown }) => {
      // Filter events for this book
      const jobData = data as { bookId?: string };
      if (jobData.bookId === bookId) {
        sendEvent(res, 'progress', data);
      }
    };
    
    // Listen for job completion
    const completedHandler = async ({ jobId }: { jobId: string }) => {
      // Refresh book status
      const updatedBook = await bookQueries.getBook(bookId);
      if (updatedBook) {
        sendEvent(res, 'status', {
          bookId,
          status: updatedBook.status,
          completedChapters: updatedBook.completedChapters,
          expectedChapters: updatedBook.expectedChapters,
        });
        
        // Close connection if terminal state
        if (['published', 'failed'].includes(updatedBook.status)) {
          sendEvent(res, 'done', { status: updatedBook.status });
          cleanup();
        }
      }
    };
    
    queueEvents.on('progress', progressHandler);
    queueEvents.on('completed', completedHandler);
    
    // Heartbeat every 15s
    const heartbeatInterval = setInterval(() => {
      sendEvent(res, 'heartbeat', { timestamp: Date.now() });
    }, 15000);
    
    // Cleanup on disconnect
    const cleanup = () => {
      clearInterval(heartbeatInterval);
      queueEvents.off('progress', progressHandler);
      queueEvents.off('completed', completedHandler);
      queueEvents.close();
    };
    
    req.on('close', cleanup);
  },
);

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export { router as progressRouter };
```

---

## tRPC Setup

### Context & Middleware

```typescript
// apps/api/src/trpc.ts

import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { z } from 'zod';

// Context type
export interface Context {
  userId: string | null;
}

// Create context from Express request
export function createContext({ req }: CreateExpressContextOptions): Context {
  // Auth middleware injects this
  return {
    userId: req.auth?.userId ?? null,
  };
}

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof z.ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// Export reusable parts
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId, // Now non-null
    },
  });
});
```

---

## Books Router

```typescript
// apps/api/src/features/books/router.ts

import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc';
import { BookListItemSchema, BookWithChaptersSchema, BookSelectSchema } from '@shared/db';
import { bookService } from './service';

export const booksRouter = router({
  // List user's books
  list: protectedProcedure
    .output(z.array(BookListItemSchema))
    .query(async ({ ctx }) => {
      return bookService.listBooks(ctx.userId);
    }),
  
  // Get single book with chapters
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(BookWithChaptersSchema.nullable())
    .query(async ({ ctx, input }) => {
      return bookService.getBook(ctx.userId, input.id);
    }),
  
  // Get book status (lightweight polling alternative to SSE)
  status: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({
      status: z.string(),
      completedChapters: z.number(),
      expectedChapters: z.number().nullable(),
      errorMessage: z.string().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      return bookService.getBookStatus(ctx.userId, input.id);
    }),
  
  // Retry failed book
  retry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await bookService.retryBook(ctx.userId, input.id);
      return { success: true };
    }),
  
  // Delete book
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await bookService.deleteBook(ctx.userId, input.id);
      return { success: true };
    }),
});
```

---

## Chapters Router

```typescript
// apps/api/src/features/chapters/router.ts

import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc';
import { ChapterSelectSchema } from '@shared/db';
import { chapterService } from './service';

export const chaptersRouter = router({
  // Get single chapter (for reader)
  get: protectedProcedure
    .input(z.object({
      bookId: z.string().uuid(),
      chapterId: z.string().uuid(),
    }))
    .output(ChapterSelectSchema.nullable())
    .query(async ({ ctx, input }) => {
      return chapterService.getChapter(ctx.userId, input.bookId, input.chapterId);
    }),
  
  // Get chapter by number (for navigation)
  getByNumber: protectedProcedure
    .input(z.object({
      bookId: z.string().uuid(),
      chapterNumber: z.number().int().positive(),
    }))
    .output(ChapterSelectSchema.nullable())
    .query(async ({ ctx, input }) => {
      return chapterService.getChapterByNumber(
        ctx.userId,
        input.bookId,
        input.chapterNumber,
      );
    }),
  
  // List chapters for a book (table of contents)
  list: protectedProcedure
    .input(z.object({ bookId: z.string().uuid() }))
    .output(z.array(ChapterSelectSchema.pick({
      id: true,
      chapterNumber: true,
      title: true,
      status: true,
      imageUrl: true,
    })))
    .query(async ({ ctx, input }) => {
      return chapterService.listChapters(ctx.userId, input.bookId);
    }),
});
```

---

## App Router (Combined)

```typescript
// apps/api/src/features/router.ts

import { router } from '../trpc';
import { booksRouter } from './books/router';
import { chaptersRouter } from './chapters/router';

export const appRouter = router({
  books: booksRouter,
  chapters: chaptersRouter,
});

// Export type for client
export type AppRouter = typeof appRouter;
```

---

## Express Server Setup

```typescript
// apps/api/src/server.ts

import 'express-async-errors'; // Must be first!
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import pinoHttp from 'pino-http';
import { clerkMiddleware } from '@clerk/express';
import { createContext, appRouter } from './features/router';
import { uploadRouter } from './routes/upload';
import { progressRouter } from './routes/progress';
import { errorHandler } from './middleware/errorHandler';
import { env } from './env';

const app = express();

// Middleware
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use(pinoHttp({ level: env.LOG_LEVEL }));

// Auth middleware
if (env.NODE_ENV === 'production') {
  app.use(clerkMiddleware());
} else {
  // Dev bypass - inject mock user
  app.use((req, _res, next) => {
    req.auth = { userId: 'dev-user-001' };
    next();
  });
}

// Express routes (non-tRPC)
app.use('/api', uploadRouter);
app.use('/api', progressRouter);

// tRPC handler
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`tRPC error on ${path}:`, error);
    },
  }),
);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
```

---

## API Endpoints Summary

| Method | Path | Handler | Auth | Description |
|--------|------|---------|------|-------------|
| `POST` | `/api/upload` | Express + multer | ✅ | Upload .txt file |
| `GET` | `/api/progress/:bookId` | Express SSE | ✅ | Real-time progress stream |
| `GET` | `/api/trpc/books.list` | tRPC | ✅ | List user's books |
| `GET` | `/api/trpc/books.get` | tRPC | ✅ | Get book with chapters |
| `GET` | `/api/trpc/books.status` | tRPC | ✅ | Get book processing status |
| `POST` | `/api/trpc/books.retry` | tRPC | ✅ | Retry failed book |
| `POST` | `/api/trpc/books.delete` | tRPC | ✅ | Delete book |
| `GET` | `/api/trpc/chapters.get` | tRPC | ✅ | Get single chapter |
| `GET` | `/api/trpc/chapters.getByNumber` | tRPC | ✅ | Get chapter by number |
| `GET` | `/api/trpc/chapters.list` | tRPC | ✅ | List chapters (TOC) |
| `GET` | `/health` | Express | ❌ | Health check |

---

## Client Usage Examples

```typescript
// apps/web/src/trpc.ts

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@api/features/router';

export const trpc = createTRPCReact<AppRouter>();
```

```typescript
// List books
const { data: books } = trpc.books.list.useQuery();

// Get book with chapters
const { data: book } = trpc.books.get.useQuery({ id: bookId });

// Get book status (polling)
const { data: status } = trpc.books.status.useQuery(
  { id: bookId },
  { refetchInterval: 5000 }, // Poll every 5s
);

// Retry failed book
const retryMutation = trpc.books.retry.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['books'] });
  },
});

// Delete book
const deleteMutation = trpc.books.delete.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['books'] });
  },
});
```
