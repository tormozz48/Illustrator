import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { db } from './db.js';
import { logger } from './logger.js';
import { bookQueue } from './queue.js';

/**
 * tRPC context — available in all procedures
 */
export const createContext = ({ req }: CreateExpressContextOptions) => {
  return {
    userId: req.userId, // Set by auth middleware
    db,
    queue: bookQueue,
    logger: req.log || logger,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * tRPC instance
 */
const t = initTRPC.context<Context>().create();

/**
 * Base router and procedure
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires authenticated user
 */
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
      userId: ctx.userId, // Now guaranteed to be string (not undefined)
    },
  });
});
