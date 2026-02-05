/**
 * actions.ts – Device commands: On / Off / Toggle for smart plugs.
 *
 * Sends ZCL commands to a device's On/Off cluster using zigbee-herdsman
 * endpoint.command(). The approach works as follows:
 *
 *   1.  Look up the herdsman Device by IEEE address.
 *   2.  Find an endpoint that has the genOnOff input cluster (cluster ID 6).
 *       – Smart plugs usually have this on endpoint 1.
 *   3.  Call `endpoint.command('genOnOff', '<cmd>', {})` where <cmd> is
 *       one of: "on", "off", "toggle".
 *
 * This is the standard ZCL On/Off cluster behaviour and works with any
 * compliant Zigbee device (Sonoff, IKEA TRÅDFRI, Tuya, etc.).
 */

import { UnsupportedActionError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import type { DeviceRegistry } from "./deviceRegistry";

const log = () => getLogger();

export type OnOffAction = "on" | "off" | "toggle";

/**
 * Send an On/Off command to a device.
 *
 * @param registry  The device registry (used to look up endpoints)
 * @param ieeeAddr  IEEE address of the target device
 * @param action    "on" | "off" | "toggle"
 */
export async function sendOnOff(
  registry: DeviceRegistry,
  ieeeAddr: string,
  action: OnOffAction,
): Promise<void> {
  const ep = registry.getOnOffEndpoint(ieeeAddr);

  if (!ep) {
    throw new UnsupportedActionError(action, ieeeAddr);
  }

  log().info(`Sending "${action}" to ${ieeeAddr} (endpoint ${ep.ID})…`);

  /*
   * endpoint.command(clusterKey, commandKey, payload, options?)
   *
   * clusterKey = 'genOnOff' – the standard ZCL On/Off cluster
   * commandKey = 'on' | 'off' | 'toggle' – cluster-specific commands
   * payload    = {} – these commands carry no payload
   */
  await ep.command("genOnOff", action, {});

  log().info(`✅ "${action}" sent successfully to ${ieeeAddr}`);
}
