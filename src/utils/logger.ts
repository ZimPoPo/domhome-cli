/**
 * logger.ts – Centralized logging via Pino.
 *
 * Provides a pre-configured pino logger with pretty-print support for the
 * interactive CLI. The log level is driven by the LOG_LEVEL env variable.
 */

import pino from "pino";

/**
 * Create the application-wide logger.
 * Uses pino-pretty in development for human-readable output.
 */
export function createLogger(level: string = "info"): pino.Logger {
  return pino({
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  });
}

/** Singleton logger – initialized lazily via `initLogger()`. */
let _logger: pino.Logger | undefined;

/** Initialize the singleton logger with the desired level. */
export function initLogger(level: string): pino.Logger {
  _logger = createLogger(level);
  return _logger;
}

/** Retrieve the singleton logger. Falls back to info level if not yet initialized. */
export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger("info");
  }
  return _logger;
}
