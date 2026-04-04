import 'dotenv/config';
import { z } from 'zod';
// Import CLI logger first so setLogger() is called before any core code runs.
import { logger } from './logger.js';

const EnvSchema = z.object({
  GEMINI_API_KEY: z
    .string()
    .min(1, 'GEMINI_API_KEY is required. Get one at https://aistudio.google.com/apikey'),
  DEFAULT_STYLE: z.enum(['watercolor', 'comic', 'realistic', 'anime']).default('watercolor'),
  DEFAULT_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  logger.error(`Environment configuration error:\n${errors}`);
  process.exit(1);
}

export const config = parsed.data;
