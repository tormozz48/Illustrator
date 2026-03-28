import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc.js';
import * as service from './service.js';

/**
 * Books tRPC router
 * THIN: validate input, call service, return result
 */
export const booksRouter = router({
  /**
   * List all books for the authenticated user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return service.listUserBooks(ctx.db, ctx.userId);
  }),

  /**
   * Get a single book by ID (with ownership check)
   */
  get: protectedProcedure
    .input(z.object({ bookId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return service.getUserBook(ctx.db, input.bookId, ctx.userId);
    }),

  /**
   * Delete a book (with ownership check)
   */
  delete: protectedProcedure
    .input(z.object({ bookId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await service.deleteUserBook(ctx.db, input.bookId, ctx.userId);
      return { success: true };
    }),
});
