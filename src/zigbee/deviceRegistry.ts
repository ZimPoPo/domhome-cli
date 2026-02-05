/**
 * deviceRegistry.ts – Typed wrappers around zigbee-herdsman Device objects.
 *
 * Provides a clean API to list, find and describe devices that the
 * coordinator knows about (from the persistent DB or recently joined).
 */

import { DeviceNotFoundError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import type { ZigbeeCoordinator } from "./coordinator";

const log = () => getLogger();

// ---------------------------------------------------------------------------
// Types – lightweight view-models exposed to the CLI layer
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  /** IEEE 64-bit address (e.g. "0x00124b002345abcd") */
  ieeeAddr: string;
  /** Human-readable name or model if known */
  friendlyName: string;
  /** Herdsman device type: Coordinator | Router | EndDevice | Unknown | GreenPower */
  type: string;
  /** Model ID reported by the device during interview */
  modelID: string | undefined;
  /** Manufacturer name reported by the device */
  manufacturerName: string | undefined;
  /** Power source (e.g. "Mains (single phase)", "Battery") */
  powerSource: string | undefined;
  /** Whether the device interview completed successfully */
  interviewCompleted: boolean;
  /** Last seen timestamp (ms since epoch) */
  lastSeen: number | undefined;
  /** Endpoint IDs available on this device */
  endpointIds: number[];
  /** Whether the device exposes the On/Off cluster on any endpoint */
  supportsOnOff: boolean;
}

// On/Off cluster ID = 6 (genOnOff in ZCL)
const CLUSTER_ON_OFF = 6;

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class DeviceRegistry {
  constructor(private readonly coordinator: ZigbeeCoordinator) {}

  /**
   * List all paired devices (excluding the coordinator itself).
   * Returns lightweight DeviceInfo objects for display.
   */
  listDevices(): DeviceInfo[] {
    const ctrl = this.coordinator.getController();
    const devices: DeviceInfo[] = [];

    for (const dev of ctrl.getDevicesIterator()) {
      // Skip the coordinator
      if (dev.type === "Coordinator") continue;

      const supportsOnOff = dev.endpoints.some(
        (ep) =>
          ep.inputClusters.includes(CLUSTER_ON_OFF) ||
          ep.outputClusters.includes(CLUSTER_ON_OFF),
      );

      devices.push({
        ieeeAddr: dev.ieeeAddr,
        friendlyName: dev.modelID ?? dev.ieeeAddr,
        type: dev.type,
        modelID: dev.modelID,
        manufacturerName: dev.manufacturerName,
        powerSource: dev.powerSource,
        interviewCompleted: dev.interviewCompleted,
        lastSeen: dev.lastSeen,
        endpointIds: dev.endpoints.map((ep) => ep.ID),
        supportsOnOff,
      });
    }

    return devices;
  }

  /**
   * Find a specific device by IEEE address.
   * Throws DeviceNotFoundError if not found.
   */
  findDevice(ieeeAddr: string): DeviceInfo {
    const list = this.listDevices();
    const match = list.find((d) => d.ieeeAddr === ieeeAddr);
    if (!match) throw new DeviceNotFoundError(ieeeAddr);
    return match;
  }

  /**
   * Get the underlying herdsman Device object by IEEE address.
   * Useful when you need to call ZCL commands.
   */
  getHerdsmanDevice(ieeeAddr: string) {
    const ctrl = this.coordinator.getController();
    const device = ctrl.getDeviceByIeeeAddr(ieeeAddr);
    if (!device) throw new DeviceNotFoundError(ieeeAddr);
    return device;
  }

  /**
   * Find the first endpoint on a device that has the genOnOff input cluster.
   * This is typically endpoint 1 on a smart plug.
   */
  getOnOffEndpoint(ieeeAddr: string) {
    const device = this.getHerdsmanDevice(ieeeAddr);

    // Prefer input-cluster match (the device "accepts" on/off commands)
    const ep =
      device.endpoints.find((e) => e.inputClusters.includes(CLUSTER_ON_OFF)) ??
      device.endpoints.find((e) => e.outputClusters.includes(CLUSTER_ON_OFF));

    if (!ep) {
      log().warn(
        `Device ${ieeeAddr} does not expose the On/Off cluster on any endpoint`,
      );
      return undefined;
    }
    return ep;
  }
}
