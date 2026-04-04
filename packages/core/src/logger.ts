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

import pino from "pino";

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const pinoLoggerImpl = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

/** Pino-backed default. Outputs NDJSON to stdout. */
export const pinoLogger: Logger = {
  info(msg, meta) {
    if (meta) pinoLoggerImpl.info(meta, msg);
    else pinoLoggerImpl.info(msg);
  },
  warn(msg, meta) {
    if (meta) pinoLoggerImpl.warn(meta, msg);
    else pinoLoggerImpl.warn(msg);
  },
  error(msg, meta) {
    if (meta) pinoLoggerImpl.error(meta, msg);
    else pinoLoggerImpl.error(msg);
  },
  debug(msg, meta) {
    if (meta) pinoLoggerImpl.debug(meta, msg);
    else pinoLoggerImpl.debug(msg);
  },
};

let current: Logger = pinoLogger;

/**
 * Replace the global logger used by all core modules.
 * Call once at application startup before any pipeline function runs.
 */
export function setLogger(logger: Logger): void {
  current = logger;
}

/** Get the currently configured logger. */
export function getLogger(): Logger {
  return current;
}
