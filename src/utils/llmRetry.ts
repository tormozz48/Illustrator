import type { ZodSchema } from 'zod';
import { logger } from '../logger.js';
import { sanitizeLlmJson } from './jsonRepair.js';

export interface LlmJsonCallOptions<T> {
  /** Async function that performs the LLM call and returns the raw text response. */
  call: () => Promise<string | null | undefined>;
  /** Zod schema used to validate the parsed JSON. */
  schema: ZodSchema<T>;
  /** Maximum number of additional attempts after the first failure. Defaults to 2. */
  maxRetries?: number;
  /** Human-readable label for log messages (e.g. "analyzeBook"). */
  label?: string;
}

/**
 * Execute an LLM call that returns JSON, with sanitisation, validation,
 * and automatic retries on parse or schema errors.
 *
 * Retry strategy: immediate re-call (no backoff).  Gemini's JSON mode
 * generation is non-deterministic, so a plain retry succeeds most of
 * the time without extra delay.
 */
export async function callWithJsonRetry<T>({
  call,
  schema,
  maxRetries = 2,
  label = 'llm',
}: LlmJsonCallOptions<T>): Promise<T> {
  let lastError: Error = new Error(`${label}: no attempts made`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prefix = attempt > 0 ? `${label}: retry ${attempt}/${maxRetries}` : label;

    try {
      const rawText = await invokeLlmCall({ call, prefix });
      const parsed = parseJsonResponse({ rawText, prefix });
      const result = validateSchema({ parsed, schema, prefix });

      if (attempt > 0) {
        logger.info(`${label}: succeeded on retry ${attempt}`);
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}

/** Invoke the LLM call and return non-empty raw text, or throw on failure. */
async function invokeLlmCall({
  call,
  prefix,
}: {
  call: () => Promise<string | null | undefined>;
  prefix: string;
}): Promise<string> {
  let rawText: string | null | undefined;
  try {
    rawText = await call();
  } catch (err) {
    const message = `${prefix}: LLM call threw — ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(message);
    throw new Error(message);
  }

  if (!rawText || rawText.trim() === '') {
    const message = `${prefix}: empty response`;
    logger.warn(message);
    throw new Error(message);
  }

  return rawText;
}

/** Sanitise and JSON-parse raw LLM text, or throw on failure. */
function parseJsonResponse({
  rawText,
  prefix,
}: {
  rawText: string;
  prefix: string;
}): unknown {
  const sanitized = sanitizeLlmJson(rawText);
  try {
    return JSON.parse(sanitized);
  } catch (err) {
    const message = `${prefix}: JSON.parse failed — ${err instanceof Error ? err.message : String(err)}`;
    logger.warn(message);
    logger.debug(`${prefix}: response excerpt (first 300 chars): ${rawText.slice(0, 300)}`);
    throw new Error(message);
  }
}

/** Validate parsed JSON against a Zod schema, or throw on failure. */
function validateSchema<T>({
  parsed,
  schema,
  prefix,
}: {
  parsed: unknown;
  schema: ZodSchema<T>;
  prefix: string;
}): T {
  const result = schema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  const message = `${prefix}: schema validation failed — ${result.error.message}`;
  logger.warn(message);
  throw new Error(message);
}
