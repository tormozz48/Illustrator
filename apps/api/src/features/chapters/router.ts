import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc.js';
import * as service from './service.js';

/**
 * Chapters tRPC router
 * THIN: validate input, call service, return result
 */
export const chaptersRouter = router({
  /**
   * List all chapters for a book
   */
  list: protectedProcedure
    .input(z.object({ bookId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return service.getBookChapters(ctx.db, input.bookId);
    }),

  /**
   * Get a single chapter by ID (with ownership check)
   */
  get: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return service.getUserChapter(ctx.db, input.chapterId, ctx.userId);
    }),
});
