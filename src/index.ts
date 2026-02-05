/**
 * index.ts – domhome-cli entrypoint.
 *
 * 1. Loads environment configuration from .env
 * 2. Initializes the pino logger
 * 3. Creates the ZigbeeCoordinator and DeviceRegistry
 * 4. Prints a banner and enters the interactive menu loop
 * 5. Handles SIGINT / SIGTERM for graceful shutdown
 */

import { mainMenuLoop } from "./cli/menu";
import { loadConfig } from "./config";
import { formatError } from "./utils/errors";
import { initLogger } from "./utils/logger";
import { ZigbeeCoordinator } from "./zigbee/coordinator";
import { DeviceRegistry } from "./zigbee/deviceRegistry";

// ─── Banner ──────────────────────────────────────────────────────────

function printBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          🏠  domhome-cli  –  Zigbee Shell  v0.1           ║
║                                                           ║
║   Interactive CLI for Zigbee coordinator & smart devices  ║
║   Supports Sonoff ZBDongle-E (EZSP / EmberZNet)          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  // 1. Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`\n❌ Configuration error:\n   ${formatError(err)}\n`);
    process.exit(1);
  }

  // 2. Initialize logger
  const log = initLogger(config.logLevel);
  log.info("Configuration loaded");
  log.debug({ config }, "Resolved config");

  // 3. Create core services
  const coordinator = new ZigbeeCoordinator(config);
  const registry = new DeviceRegistry(coordinator);

  // 4. Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal} – shutting down…`);
    if (coordinator.isRunning) {
      try {
        await coordinator.stop();
      } catch (err) {
        log.error(`Shutdown error: ${formatError(err)}`);
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 5. Print config summary
  console.log(`  Serial port : ${config.serialPort}`);
  console.log(`  Adapter     : ${config.adapter}`);
  console.log(`  Baud rate   : ${config.baudRate}`);
  console.log(`  DB path     : ${config.dbPath}`);
  console.log(`  Log level   : ${config.logLevel}`);
  console.log();

  // 6. Enter the interactive menu
  await mainMenuLoop(coordinator, registry);
}

// ── Run ──────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n💥 Fatal error: ${formatError(err)}\n`);
  process.exit(1);
});
