import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { books } from '@illustrator/shared/db';

/**
 * GET /api/progress/:bookId
 * Server-Sent Events (SSE) endpoint for real-time book processing updates
 */
export async function handleProgress(req: Request, res: Response) {
  const { bookId } = req.params;

  // Type-guard: ensure bookId is a string, not an array
  if (!bookId || Array.isArray(bookId)) {
    res.status(400).json({ error: 'Book ID is required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Poll database for updates every 2 seconds
  const interval = setInterval(async () => {
    try {
      const [book] = await req.app.locals.db
        .select()
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);

      if (!book) {
        res.write(`data: ${JSON.stringify({ error: 'Book not found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      const progress = calculateProgress(book);

      res.write(`data: ${JSON.stringify(progress)}\n\n`);

      // Close connection when processing is complete
      if (book.status === 'published' || book.status === 'failed') {
        clearInterval(interval);
        res.end();
      }
    } catch (error) {
      req.log.error(error, 'Progress polling failed');
      res.write(`data: ${JSON.stringify({ error: 'Internal error' })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 2000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
}

/**
 * Calculate progress percentage based on book status
 */
function calculateProgress(book: {
  status: string;
  expectedChapters: string | null;
  completedChapters: string | null;
}) {
  const statusProgress: Record<string, number> = {
    uploading: 5,
    splitting: 15,
    generatingBible: 25,
    illustrating: 50,
    assembling: 90,
    published: 100,
    failed: 0,
  };

  let baseProgress = statusProgress[book.status] ?? 0;

  // During illustration phase, calculate based on chapter completion
  if (
    book.status === 'illustrating' &&
    book.expectedChapters &&
    book.completedChapters
  ) {
    const expected = Number.parseInt(book.expectedChapters, 10);
    const completed = Number.parseInt(book.completedChapters, 10);

    if (expected > 0) {
      baseProgress = 25 + (completed / expected) * 65; // 25% to 90%
    }
  }

  return {
    status: book.status,
    progress: Math.round(baseProgress),
    currentStep: getCurrentStepLabel(book.status),
  };
}

/**
 * Get human-readable label for current processing step
 */
function getCurrentStepLabel(status: string): string {
  const labels: Record<string, string> = {
    uploading: 'Uploading file...',
    splitting: 'Splitting into chapters...',
    generatingBible: 'Generating style bible...',
    illustrating: 'Creating illustrations...',
    assembling: 'Assembling final book...',
    published: 'Complete!',
    failed: 'Processing failed',
  };

  return labels[status] ?? 'Processing...';
}
