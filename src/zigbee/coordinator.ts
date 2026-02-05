/**
 * coordinator.ts – Manages the zigbee-herdsman Controller lifecycle.
 *
 * Responsibilities:
 *   - Create and configure the Controller instance
 *   - Start / stop the coordinator (network init)
 *   - Permit join for N seconds
 *   - Forward relevant events to the application layer
 *
 * ASSUMPTIONS:
 *   - The ZBDongle-E uses the EmberZNet adapter. In zigbee-herdsman the
 *     recommended adapter name for Silicon Labs dongles (EFR32) is "ember".
 *     The legacy "ezsp" driver is deprecated for firmware ≥ 7.4.x.
 *   - The "ember" adapter can handle dongles stuck in the Gecko Bootloader
 *     by sending the "run" command to launch the application firmware.
 *   - We use a default PAN ID and network key; for a real deployment you'd
 *     want to make those configurable too.
 */

import { Controller } from "zigbee-herdsman";
import type { AppConfig } from "../config";
import { CoordinatorError, formatError } from "../utils/errors";
import { getLogger } from "../utils/logger";

// Re-export herdsman types that the rest of the app may need
export type { Controller } from "zigbee-herdsman";

const log = () => getLogger();

/** Singleton wrapper around zigbee-herdsman's Controller. */
export class ZigbeeCoordinator {
  private controller: Controller | null = null;
  private started = false;
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /** Create the herdsman Controller (does NOT start communication). */
  private createController(): Controller {
    /*
     * The Controller options mirror what Zigbee2MQTT passes to herdsman.
     * We keep reasonable defaults for a prototype.
     */
    const controller = new Controller({
      network: {
        panID: 0x1a62,
        // Default channel list – channel 11 is commonly used
        channelList: [11],
        // Let herdsman generate a random network key on first start
      },
      serialPort: {
        path: this.config.serialPort,
        baudRate: this.config.baudRate,
        // For Silicon Labs dongles (ZBDongle-E), use "ember" (recommended)
        // or "ezsp" (legacy, deprecated for firmware ≥ 7.4.x).
        // The "ember" adapter can exit the Gecko Bootloader automatically.
        adapter: this.config.adapter as any,
        rtscts: false,
      },
      databasePath: this.config.dbPath,
      databaseBackupPath: this.config.dbPath + ".backup",
      backupPath: this.config.dbPath.replace(/\.db$/, "") + "_backup.json",
      adapter: {
        disableLED: false,
      },
      acceptJoiningDeviceHandler: async (_ieeeAddr: string) => {
        // Accept every device that tries to join – prototype behaviour.
        log().info(`Accepting device: ${_ieeeAddr}`);
        return true;
      },
    });

    return controller;
  }

  /** Start the coordinator (initialises the network & opens serial). */
  async start(): Promise<string> {
    if (this.started) {
      log().warn("Coordinator already started");
      return "already-started";
    }

    try {
      this.controller = this.createController();
      this.registerEvents();

      log().info(
        `Starting coordinator on ${this.config.serialPort} (adapter=${this.config.adapter}, baud=${this.config.baudRate})…`,
      );

      const result = await this.controller.start();
      this.started = true;
      log().info(`Coordinator started – result: ${result}`);
      return result;
    } catch (err: unknown) {
      this.started = false;
      this.controller = null;

      const msg = formatError(err);

      // Produce user-friendly hints for common failures
      if (msg.includes("ENOENT") || msg.includes("no such file")) {
        throw new CoordinatorError(
          `Serial port "${this.config.serialPort}" not found. ` +
            `Check ZIGBEE_SERIAL_PORT in .env and make sure the dongle is plugged in.`,
          err,
        );
      }
      if (msg.includes("EACCES") || msg.includes("Permission denied")) {
        throw new CoordinatorError(
          `Permission denied on "${this.config.serialPort}". ` +
            `On Linux run: sudo chmod 666 ${this.config.serialPort}  (or add your user to the dialout group).`,
          err,
        );
      }
      if (msg.includes("EBUSY") || msg.includes("resource busy")) {
        throw new CoordinatorError(
          `Port "${this.config.serialPort}" is busy. Close any other program using it.`,
          err,
        );
      }

      // HOST_FATAL_ERROR / RSTACK timeout – the dongle never replied.
      // Most common cause: another program (Home Assistant, Zigbee2MQTT,
      // ZHA, another instance of this CLI) is already using the port.
      if (
        msg.includes("HOST_FATAL_ERROR") ||
        msg.includes("Failure to connect") ||
        msg.includes("RSTACK") ||
        msg.includes("Bootloader") ||
        msg.includes("EZSP could not connect")
      ) {
        const isLegacy = this.config.adapter === "ezsp";
        throw new CoordinatorError(
          `Could not connect to the dongle on "${this.config.serialPort}".\n` +
            `   The adapter sent reset frames but the dongle never responded (RSTACK timeout).\n\n` +
            `   Most likely causes (in order):\n` +
            `   1. Another program is using the port – stop Home Assistant / Zigbee2MQTT / ZHA first.\n` +
            `      Only ONE program can use a serial port at a time.\n` +
            `   2. Unplug the dongle, wait 5 s, plug it back in (power cycle).\n` +
            `   3. Wrong serial port – verify ZIGBEE_SERIAL_PORT in .env.\n` +
            (isLegacy
              ? `   4. The legacy "ezsp" driver is deprecated → set ZIGBEE_ADAPTER=ember.\n`
              : "") +
            `   4. Firmware may be corrupted – re-flash with Sonoff firmware tool.`,
          err,
        );
      }

      throw new CoordinatorError(`Failed to start coordinator: ${msg}`, err);
    }
  }

  /** Gracefully stop the coordinator. */
  async stop(): Promise<void> {
    if (!this.started || !this.controller) {
      log().warn("Coordinator is not running");
      return;
    }

    log().info("Stopping coordinator…");
    try {
      await this.controller.stop();
    } catch (err) {
      log().error(`Error during coordinator stop: ${formatError(err)}`);
    } finally {
      this.started = false;
      this.controller = null;
    }
    log().info("Coordinator stopped");
  }

  // ─── Network operations ─────────────────────────────────────────────

  /**
   * Enable permit join for `seconds` (1-254).
   * New devices can join the network while the window is open.
   */
  async permitJoin(seconds: number): Promise<void> {
    this.assertRunning();
    const time = Math.min(Math.max(seconds, 1), 254);
    log().info(`Permit join enabled for ${time}s`);
    await this.controller!.permitJoin(time);
  }

  /** Disable permit join immediately. */
  async disableJoin(): Promise<void> {
    this.assertRunning();
    await this.controller!.permitJoin(0);
    log().info("Permit join disabled");
  }

  // ─── Accessors ──────────────────────────────────────────────────────

  /** Whether the coordinator is started. */
  get isRunning(): boolean {
    return this.started;
  }

  /** Get the underlying herdsman Controller (throws if not started). */
  getController(): Controller {
    this.assertRunning();
    return this.controller!;
  }

  // ─── Event wiring ──────────────────────────────────────────────────

  /**
   * Register listeners on the herdsman Controller for the events we
   * care about and forward them to the pino logger so the user sees
   * real-time activity in the CLI.
   */
  private registerEvents(): void {
    const c = this.controller!;

    c.on("deviceJoined", (data) => {
      log().info(
        `🔗 Device JOINED – IEEE: ${data.device.ieeeAddr}, type: ${data.device.type}`,
      );
    });

    c.on("deviceInterview", (data) => {
      const { status, device } = data;
      if (status === "started") {
        log().info(`🔍 Interview STARTED – ${device.ieeeAddr}`);
      } else if (status === "successful") {
        log().info(
          `✅ Interview SUCCESSFUL – ${device.ieeeAddr} ` +
            `(model: ${device.modelID ?? "unknown"}, manufacturer: ${device.manufacturerName ?? "unknown"})`,
        );
      } else {
        log().warn(`❌ Interview FAILED – ${device.ieeeAddr}`);
      }
    });

    c.on("deviceLeave", (data) => {
      log().info(`👋 Device LEFT – IEEE: ${data.ieeeAddr}`);
    });

    c.on("deviceAnnounce", (data) => {
      log().info(`📢 Device ANNOUNCE – IEEE: ${data.device.ieeeAddr}`);
    });

    c.on("message", (data) => {
      log().debug(
        `📨 Message – device=${data.device.ieeeAddr}, cluster=${data.cluster}, type=${data.type}`,
      );
    });

    c.on("adapterDisconnected", () => {
      log().error("⚠️  Adapter disconnected! Check the USB connection.");
      this.started = false;
    });

    c.on("permitJoinChanged", (data) => {
      if (data.permitted) {
        log().info(`🔓 Permit join OPEN (remaining: ${data.time ?? "?"}s)`);
      } else {
        log().info("🔒 Permit join CLOSED");
      }
    });
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  private assertRunning(): void {
    if (!this.started || !this.controller) {
      throw new CoordinatorError("Coordinator is not running. Start it first.");
    }
  }
}
