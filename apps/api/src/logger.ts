/**
 * Structured JSON logger for Cloudflare Workers.
 *
 * Implements the Logger interface and outputs newline-delimited JSON to
 * console.*. Workers Logs captures these calls, and the Query Builder can
 * filter/aggregate on any field in the JSON.
 *
 * Log shape:
 *   { "level": "info", "msg": "step.batch.complete", "bookId": "abc", "succeeded": 3 }
 */

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export const workersLogger: Logger = {
  info(msg: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', msg, ...meta }));
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: 'warn', msg, ...meta }));
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', msg, ...meta }));
  },
  debug(_msg: string, _meta?: Record<string, unknown>): void {
    // Intentionally no-op in production Workers to avoid log volume.
    // Re-enable locally via: wrangler dev --log-level debug
  },
};

let current: Logger = workersLogger;

/**
 * Replace the global logger used by all modules.
 * Call once at application startup before any pipeline function runs.
 */
export function setLogger(logger: Logger): void {
  current = logger;
}

/** Get the currently configured logger. */
export function getLogger(): Logger {
  return current;
}
