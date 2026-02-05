/**
 * menu.ts – Inquirer-based interactive main menu.
 *
 * Renders the top-level menu loop and dispatches to the screens module
 * for each action. Runs until the user selects "Exit".
 */

import inquirer from "inquirer";
import { getLogger } from "../utils/logger";
import { ZigbeeCoordinator } from "../zigbee/coordinator";
import { DeviceRegistry } from "../zigbee/deviceRegistry";
import * as screens from "./screens";

const log = () => getLogger();

// ── Menu choices ─────────────────────────────────────────────────────

enum MenuChoice {
  StartCoordinator = "start",
  StopCoordinator = "stop",
  PermitJoin = "permit",
  ListDevices = "list",
  ControlDevice = "control",
  ShowLogs = "logs",
  Exit = "exit",
}

interface MenuOption {
  name: string;
  value: MenuChoice;
}

function buildMenu(isRunning: boolean): MenuOption[] {
  const items: MenuOption[] = [];

  if (!isRunning) {
    items.push({
      name: "🚀  Start Zigbee coordinator",
      value: MenuChoice.StartCoordinator,
    });
  } else {
    items.push({
      name: "🛑  Stop Zigbee coordinator",
      value: MenuChoice.StopCoordinator,
    });
    items.push({
      name: "🔓  Enable pairing (permit join)",
      value: MenuChoice.PermitJoin,
    });
    items.push({
      name: "📋  List paired devices",
      value: MenuChoice.ListDevices,
    });
    items.push({
      name: "🔌  Control a device (ON/OFF)",
      value: MenuChoice.ControlDevice,
    });
  }

  items.push({ name: "📜  Show live logs info", value: MenuChoice.ShowLogs });
  items.push({ name: "🚪  Exit (graceful shutdown)", value: MenuChoice.Exit });

  return items;
}

// ── Main loop ────────────────────────────────────────────────────────

export async function mainMenuLoop(
  coordinator: ZigbeeCoordinator,
  registry: DeviceRegistry,
): Promise<void> {
  let running = true;

  while (running) {
    console.log(); // blank line before menu
    const { choice } = await inquirer.prompt<{ choice: MenuChoice }>([
      {
        type: "list",
        name: "choice",
        message: "domhome-cli — Main Menu",
        choices: buildMenu(coordinator.isRunning),
        pageSize: 10,
      },
    ]);

    try {
      switch (choice) {
        case MenuChoice.StartCoordinator:
          await screens.startCoordinatorScreen(coordinator);
          break;

        case MenuChoice.StopCoordinator:
          await screens.stopCoordinatorScreen(coordinator);
          break;

        case MenuChoice.PermitJoin:
          await screens.permitJoinScreen(coordinator);
          break;

        case MenuChoice.ListDevices:
          screens.listDevicesScreen(registry);
          break;

        case MenuChoice.ControlDevice:
          await screens.controlDeviceScreen(registry);
          break;

        case MenuChoice.ShowLogs:
          screens.showLogsScreen();
          break;

        case MenuChoice.Exit:
          await screens.exitScreen(coordinator);
          running = false;
          break;
      }
    } catch (err) {
      log().error(`Error: ${(err as Error).message}`);
    }
  }
}
