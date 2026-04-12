import { sanitiseJson } from './json-repair';

export interface LlmRetryOptions {
  maxRetries?: number;
  parse?: (raw: string) => any;
  validate?: (parsed: any) => boolean;
}

/**
 * Call an LLM function with sanitization, parsing, validation, and retries.
 */
export async function callWithRetry<T>(
  fn: () => Promise<string>,
  options: LlmRetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, parse = JSON.parse, validate } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const raw = await fn();
      const sanitised = sanitiseJson(raw);
      const parsed = parse(sanitised);
      if (validate && !validate(parsed)) {
        throw new Error('Validation failed');
      }
      return parsed as T;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error('LLM call failed after retries');
}
