import { createLogger, format, transports } from 'winston';

// Use JSON format when explicitly requested or running in production (e.g. AWS).
// In JSON mode every line is a structured object ready for CloudWatch / Datadog.
const isJson =
  process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const cliFormat = format.combine(
  format.colorize({ level: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message }) => `${timestamp} ${level} ${message}`)
);

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isJson ? jsonFormat : cliFormat,
  defaultMeta: { service: 'bookillust' },
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Spinner abstraction — replaces ora.
//
// In a terminal session this gives simple start / succeed / warn / fail log
// lines.  In a web-service context (LOG_FORMAT=json) each event becomes a
// structured JSON entry that CloudWatch / any log aggregator can index.
// ---------------------------------------------------------------------------

export interface Spinner {
  start(msg: string): void;
  succeed(msg: string): void;
  warn(msg: string): void;
  fail(msg: string): void;
}

export function createSpinner(): Spinner {
  return {
    start(msg: string) {
      logger.info(`⟳  ${msg}`);
    },
    succeed(msg: string) {
      logger.info(`✓  ${msg}`);
    },
    warn(msg: string) {
      logger.warn(`⚠  ${msg}`);
    },
    fail(msg: string) {
      logger.error(`✗  ${msg}`);
    },
  };
}
