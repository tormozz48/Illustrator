import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Environment variable validation for worker
 * App crashes at startup if any required variable is missing or malformed
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    
    // Database
    DATABASE_URL: z.string().url(),
    
    // Redis (for BullMQ)
    REDIS_URL: z.string().url(),
    
    // Groq API (for AI text processing)
    GROQ_API_KEY: z.string().min(1),
    
    // Cloudflare R2 storage
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_PUBLIC_URL: z.string().url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
