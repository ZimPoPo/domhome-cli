/**
 * screens.ts – Individual menu-screen implementations.
 *
 * Each function corresponds to one menu action and handles user
 * interaction (prompts) + business logic delegation.
 */

import inquirer from "inquirer";
import { formatError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import { OnOffAction, sendOnOff } from "../zigbee/actions";
import { ZigbeeCoordinator } from "../zigbee/coordinator";
import { DeviceRegistry } from "../zigbee/deviceRegistry";

const log = () => getLogger();

// ─── Start / Stop ────────────────────────────────────────────────────

export async function startCoordinatorScreen(
  coordinator: ZigbeeCoordinator,
): Promise<void> {
  console.log(
    "\n⏳ Starting coordinator – this may take 10-30 s on first run…\n",
  );
  const result = await coordinator.start();
  console.log(`\n✅ Coordinator started (result: ${result})\n`);
}

export async function stopCoordinatorScreen(
  coordinator: ZigbeeCoordinator,
): Promise<void> {
  console.log("\n⏳ Stopping coordinator…\n");
  await coordinator.stop();
  console.log("✅ Coordinator stopped.\n");
}

// ─── Permit Join ─────────────────────────────────────────────────────

export async function permitJoinScreen(
  coordinator: ZigbeeCoordinator,
): Promise<void> {
  const { seconds } = await inquirer.prompt<{ seconds: number }>([
    {
      type: "number",
      name: "seconds",
      message: "Permit join duration (seconds, 1-254):",
      default: 60,
      validate: (val: number) =>
        val >= 1 && val <= 254 ? true : "Enter a value between 1 and 254",
    },
  ]);

  await coordinator.permitJoin(seconds);
  console.log(
    `\n🔓 Pairing mode open for ${seconds}s – put your device in pairing mode now.\n`,
  );
}

// ─── List Devices ────────────────────────────────────────────────────

export function listDevicesScreen(registry: DeviceRegistry): void {
  const devices = registry.listDevices();

  if (devices.length === 0) {
    console.log("\n(no paired devices – enable pairing to add one)\n");
    return;
  }

  console.log(`\n─── Paired devices (${devices.length}) ${"─".repeat(40)}\n`);

  for (const d of devices) {
    const lastSeen = d.lastSeen
      ? new Date(d.lastSeen).toLocaleString()
      : "never";

    console.log(
      `  • ${d.friendlyName}` +
        `\n    IEEE:         ${d.ieeeAddr}` +
        `\n    Type:         ${d.type}` +
        `\n    Model:        ${d.modelID ?? "—"}` +
        `\n    Manufacturer: ${d.manufacturerName ?? "—"}` +
        `\n    Power:        ${d.powerSource ?? "—"}` +
        `\n    Interview:    ${d.interviewCompleted ? "✅ done" : "⏳ pending"}` +
        `\n    Endpoints:    [${d.endpointIds.join(", ")}]` +
        `\n    On/Off:       ${d.supportsOnOff ? "✅ yes" : "—"}` +
        `\n    Last seen:    ${lastSeen}` +
        "\n",
    );
  }
}

// ─── Control Device (On/Off) ─────────────────────────────────────────

export async function controlDeviceScreen(
  registry: DeviceRegistry,
): Promise<void> {
  const devices = registry.listDevices();

  if (devices.length === 0) {
    console.log("\n(no devices available)\n");
    return;
  }

  // Build choice list – highlight devices that support on/off
  const choices = devices.map((d) => ({
    name: `${d.supportsOnOff ? "🔌" : "  "} ${d.friendlyName} (${d.ieeeAddr}) – ${d.type}`,
    value: d.ieeeAddr,
    disabled: d.supportsOnOff ? false : ("does not support On/Off" as const),
  }));

  // Allow the user to go back
  choices.push({ name: "← Back to menu", value: "__back__", disabled: false });

  const { deviceAddr } = await inquirer.prompt<{ deviceAddr: string }>([
    {
      type: "list",
      name: "deviceAddr",
      message: "Select a device to control:",
      choices,
    },
  ]);

  if (deviceAddr === "__back__") return;

  const { action } = await inquirer.prompt<{ action: OnOffAction }>([
    {
      type: "list",
      name: "action",
      message: "Choose action:",
      choices: [
        { name: "💡  Turn ON", value: "on" },
        { name: "🌑  Turn OFF", value: "off" },
        { name: "🔄  Toggle", value: "toggle" },
      ],
    },
  ]);

  try {
    await sendOnOff(registry, deviceAddr, action);
    console.log(`\n✅ Command "${action}" sent to ${deviceAddr}\n`);
  } catch (err) {
    console.error(`\n❌ Failed: ${formatError(err)}\n`);
  }
}

// ─── Show logs info ──────────────────────────────────────────────────

export function showLogsScreen(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Logs are printed in real-time while the CLI is running.  ║
║  Events like device joins, messages, and state changes    ║
║  appear automatically in the console output.              ║
║                                                           ║
║  To increase verbosity, set LOG_LEVEL=debug in .env       ║
║  and restart the CLI.                                     ║
╚═══════════════════════════════════════════════════════════╝
`);
}

// ─── Exit ────────────────────────────────────────────────────────────

export async function exitScreen(
  coordinator: ZigbeeCoordinator,
): Promise<void> {
  if (coordinator.isRunning) {
    console.log("\n⏳ Shutting down coordinator…");
    await coordinator.stop();
  }
  console.log("👋 Goodbye!\n");
}
