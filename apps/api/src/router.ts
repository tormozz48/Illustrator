import { router } from './trpc.js';
import { booksRouter } from './features/books/router.js';
import { chaptersRouter } from './features/chapters/router.js';

/**
 * Main tRPC router
 * Combines all feature routers
 */
export const appRouter = router({
  books: booksRouter,
  chapters: chaptersRouter,
});

export type AppRouter = typeof appRouter;
