import { booksRouter } from './features/books/router.js';
import { chaptersRouter } from './features/chapters/router.js';
import { router } from './trpc.js';

/**
 * Main tRPC router
 * Combines all feature routers
 */
export const appRouter = router({
  books: booksRouter,
  chapters: chaptersRouter,
});

export type AppRouter = typeof appRouter;
