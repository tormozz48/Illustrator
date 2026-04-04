/**
 * Structured JSON logger for Cloudflare Workers.
 *
 * Implements the same Logger interface as the CLI's Winston logger, but
 * outputs newline-delimited JSON to console.*. Workers Logs captures these
 * calls, and the Query Builder can filter/aggregate on any field in the JSON.
 *
 * Usage:
 *   import { setLogger } from '@illustrator/core';
 *   import { workersLogger } from './logger.js';
 *   setLogger(workersLogger);   // once, at module load
 *
 * Log shape:
 *   { "level": "info", "msg": "step.batch.complete", "bookId": "abc", "succeeded": 3 }
 */

import type { Logger } from "@illustrator/core";

export const workersLogger: Logger = {
  info(msg: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: "info", msg, ...meta }));
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: "warn", msg, ...meta }));
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: "error", msg, ...meta }));
  },
  debug(_msg: string, _meta?: Record<string, unknown>): void {
    // Intentionally no-op in production Workers to avoid log volume.
    // Re-enable locally via: wrangler dev --log-level debug
  },
};
