/**
 * CLI logger — Winston implementation of @illustrator/core's Logger interface.
 *
 * This module has two jobs:
 *   1. Create a pretty Winston logger for CLI output.
 *   2. Register it as the global logger for all core modules via setLogger().
 *
 * Import this module early (before any pipeline functions are called) so that
 * core's getLogger() returns Winston instead of the default consoleLogger.
 */
import { type Logger, setLogger } from '@illustrator/core';
import { createLogger, format, transports } from 'winston';

export interface Spinner {
  start(msg: string): void;
  succeed(msg: string): void;
  warn(msg: string): void;
  fail(msg: string): void;
}

export function createSpinner(): Spinner {
  return {
    start(msg: string) {
      winstonLogger.info(`⟳  ${msg}`);
    },
    succeed(msg: string) {
      winstonLogger.info(`✓  ${msg}`);
    },
    warn(msg: string) {
      winstonLogger.warn(`⚠  ${msg}`);
    },
    fail(msg: string) {
      winstonLogger.error(`✗  ${msg}`);
    },
  };
}

// Use JSON format when explicitly requested or running in production.
const isJson =
  process.env['LOG_FORMAT'] === 'json' || process.env['NODE_ENV'] === 'production';

const cliFormat = format.combine(
  format.colorize({ level: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(
    ({ timestamp, level, message }) => `${timestamp} ${level} ${message}`
  )
);

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

export const winstonLogger = createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: isJson ? jsonFormat : cliFormat,
  defaultMeta: { service: 'bookillust' },
  transports: [new transports.Console()],
});

// Adapt Winston to core's Logger interface and register it globally.
// All core modules (GeminiClient, llmRetry, sliceChapters, etc.) will now
// use this Winston instance whenever they call getLogger().
const coreLogger: Logger = {
  info(msg, meta) {
    winstonLogger.info(msg, meta);
  },
  warn(msg, meta) {
    winstonLogger.warn(msg, meta);
  },
  error(msg, meta) {
    winstonLogger.error(msg, meta);
  },
  debug(msg, meta) {
    winstonLogger.debug(msg, meta);
  },
};

setLogger(coreLogger);

// Also export a plain `logger` alias so existing import patterns in this app work.
export const logger = winstonLogger;
