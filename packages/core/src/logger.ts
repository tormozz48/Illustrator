/**
 * Portable logger for @illustrator/core.
 *
 * Uses pino as the built-in default so all modules get structured JSON out
 * of the box — no setup required for plain Node.js usage.
 *
 * Platform overrides at app startup:
 *   - CLI: setLogger(pinoLogger) with pino-pretty transport for human output.
 *   - Cloudflare Worker: setLogger(workersLogger) which routes through
 *     console.* so Workers Logs captures the structured output.
 */

import pino from 'pino';

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const _pino = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

/** Pino-backed default. Outputs NDJSON to stdout. */
export const pinoLogger: Logger = {
  info(msg, meta) {
    if (meta) _pino.info(meta, msg);
    else _pino.info(msg);
  },
  warn(msg, meta) {
    if (meta) _pino.warn(meta, msg);
    else _pino.warn(msg);
  },
  error(msg, meta) {
    if (meta) _pino.error(meta, msg);
    else _pino.error(msg);
  },
  debug(msg, meta) {
    if (meta) _pino.debug(meta, msg);
    else _pino.debug(msg);
  },
};

let _current: Logger = pinoLogger;

/**
 * Replace the global logger used by all core modules.
 * Call once at application startup before any pipeline function runs.
 */
export function setLogger(logger: Logger): void {
  _current = logger;
}

/** Get the currently configured logger. */
export function getLogger(): Logger {
  return _current;
}
