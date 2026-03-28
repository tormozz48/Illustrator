import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Environment variable validation for web app
 * App crashes at startup if any required variable is missing or malformed
 */
export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    VITE_API_URL: z.string().url().default('http://localhost:3000'),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
