import { clerkMiddleware } from '@clerk/express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../env.js';

/**
 * Extend Express Request to include userId from auth
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Development auth bypass
 * In development, skip Clerk and inject mock user
 */
function devAuthBypass(req: Request, _res: Response, next: NextFunction) {
  req.userId = 'dev-user-001';
  next();
}

/**
 * Production Clerk auth middleware
 * Verifies JWT and extracts userId
 */
const productionAuth = clerkMiddleware({
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
});

/**
 * Auth middleware — Clerk in production, mock user in development
 */
export const auth: RequestHandler = env.NODE_ENV === 'development' ? devAuthBypass : productionAuth;

/**
 * Middleware to require authenticated user
 * Must be used AFTER auth middleware
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
