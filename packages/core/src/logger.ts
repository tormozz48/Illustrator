/**
 * Portable logger abstraction for @illustrator/core.
 *
 * Core never imports Winston, chalk, or any platform-specific logger.
 * Instead it uses this interface + a module-level registry that apps can
 * override at startup by calling setLogger().
 *
 * - CLI: calls setLogger(winstonLogger) before anything else.
 * - Cloudflare Workflow: uses the default consoleLogger (console.* calls
 *   are forwarded to Workers Logs automatically).
 */

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

/** Simple console-based default. Works in Node.js and Cloudflare Workers. */
export const consoleLogger: Logger = {
  info(msg) {
    console.log(`[INFO] ${msg}`);
  },
  warn(msg) {
    console.warn(`[WARN] ${msg}`);
  },
  error(msg) {
    console.error(`[ERROR] ${msg}`);
  },
  debug(msg) {
    // Skip debug in default impl to avoid noise; apps can override.
    if (process.env['DEBUG'] === '1') {
      console.debug(`[DEBUG] ${msg}`);
    }
  },
};

let _current: Logger = consoleLogger;

/**
 * Replace the global logger used by all core modules.
 * Call this once at application startup before any pipeline function runs.
 */
export function setLogger(logger: Logger): void {
  _current = logger;
}

/** Get the currently configured logger. */
export function getLogger(): Logger {
  return _current;
}
