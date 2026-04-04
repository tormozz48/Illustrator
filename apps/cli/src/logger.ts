/**
 * CLI logger — Pino implementation of @illustrator/core's Logger interface.
 *
 * - Pretty (colorized) output in CLI mode (default).
 * - Raw NDJSON when LOG_FORMAT=json or NODE_ENV=production.
 *
 * Import this module early (before any pipeline functions run) so that
 * core's getLogger() returns this Pino instance instead of consoleLogger.
 */
import { type Logger, setLogger } from '@illustrator/core';
import pino from 'pino';

export interface Spinner {
  start(msg: string): void;
  succeed(msg: string): void;
  warn(msg: string): void;
  fail(msg: string): void;
}

const isJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const pinoLoggerImpl = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'bookillust' },
  ...(isJson
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:mm:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});

// Thin wrapper matching the (msg, meta?) call convention used throughout the app.
// Also exposes a `level` property so callers can do `logger.level = 'debug'`.
export const logger = {
  get level(): string {
    return pinoLoggerImpl.level;
  },
  set level(v: string) {
    pinoLoggerImpl.level = v;
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLoggerImpl.info(meta, msg);
    } else {
      pinoLoggerImpl.info(msg);
    }
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLoggerImpl.warn(meta, msg);
    } else {
      pinoLoggerImpl.warn(msg);
    }
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLoggerImpl.error(meta, msg);
    } else {
      pinoLoggerImpl.error(msg);
    }
  },
  debug(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLoggerImpl.debug(meta, msg);
    } else {
      pinoLoggerImpl.debug(msg);
    }
  },
};

export function createSpinner(): Spinner {
  return {
    start(msg) {
      logger.info(`⟳  ${msg}`);
    },
    succeed(msg) {
      logger.info(`✓  ${msg}`);
    },
    warn(msg) {
      logger.warn(`⚠  ${msg}`);
    },
    fail(msg) {
      logger.error(`✗  ${msg}`);
    },
  };
}

// Register with core so all pipeline modules use this logger.
setLogger(logger as Logger);
