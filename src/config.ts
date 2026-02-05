/**
 * config.ts – Environment configuration loader & validator.
 *
 * Reads values from .env (via dotenv) and exposes a strongly-typed
 * AppConfig object. Fails fast with clear messages when required
 * variables are missing.
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env from project root (two levels up from src/)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported adapter types for zigbee-herdsman */
export type ZigbeeAdapter =
  | "ember"
  | "ezsp"
  | "zstack"
  | "deconz"
  | "zigate"
  | "zboss";

export interface AppConfig {
  /** Serial port of the Zigbee dongle (e.g. COM5, /dev/ttyUSB0) */
  serialPort: string;
  /** Baud rate for serial communication (default 115200) */
  baudRate: number;
  /** Adapter type – matches dongle firmware (default ezsp) */
  adapter: ZigbeeAdapter;
  /** File-system path for the persistent Zigbee DB */
  dbPath: string;
  /** Pino log level */
  logLevel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `→  Copy .env.example to .env and fill in the values.`,
    );
  }
  return value.trim();
}

function optionalEnv(key: string, fallback: string): string {
  return (process.env[key] ?? "").trim() || fallback;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export function loadConfig(): AppConfig {
  const serialPort = requireEnv("ZIGBEE_SERIAL_PORT");
  const baudRate = parseInt(optionalEnv("ZIGBEE_BAUD_RATE", "115200"), 10);
  const adapter = optionalEnv("ZIGBEE_ADAPTER", "ember") as ZigbeeAdapter;
  const dbPath = path.resolve(
    optionalEnv("ZIGBEE_DB_PATH", "./data/zigbee.db"),
  );
  const logLevel = optionalEnv("LOG_LEVEL", "info");

  if (isNaN(baudRate) || baudRate <= 0) {
    throw new Error(`Invalid ZIGBEE_BAUD_RATE – must be a positive integer.`);
  }

  const validAdapters: ZigbeeAdapter[] = [
    "ember",
    "ezsp",
    "zstack",
    "deconz",
    "zigate",
    "zboss",
  ];
  if (!validAdapters.includes(adapter)) {
    throw new Error(
      `Invalid ZIGBEE_ADAPTER "${adapter}". Must be one of: ${validAdapters.join(", ")}`,
    );
  }

  // Ensure the directory for the DB file exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return { serialPort, baudRate, adapter, dbPath, logLevel };
}
