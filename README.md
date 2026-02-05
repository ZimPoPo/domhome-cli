# domhome-cli

> Interactive CLI prototype for Zigbee smart-home control via a Sonoff ZBDongle-E (EZSP / EmberZNet).

## Features

- **Start / stop** the Zigbee coordinator
- **Permit join** – open the network for new devices for N seconds
- **List paired devices** with model, manufacturer, power source, endpoints and capabilities
- **Control smart plugs** – send ON / OFF / Toggle commands via the ZCL On/Off cluster
- **Real-time event logging** – device join, interview progress, messages, adapter disconnect
- **Persistent storage** – paired devices are remembered across restarts (SQLite-like DB file)
- **Graceful shutdown** on Ctrl+C

## Requirements

| Requirement   | Version                                                         |
| ------------- | --------------------------------------------------------------- |
| Node.js       | ≥ 18                                                            |
| npm           | ≥ 9                                                             |
| Zigbee dongle | Sonoff ZBDongle-E (EZSP) — or any Silicon Labs EmberZNet dongle |

## Quick Start

### 1. Clone & install

```bash
cd domhome-core
npm install
```

### 2. Configure

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your serial port:

| Variable             | Windows example    | Linux / Raspberry Pi example     |
| -------------------- | ------------------ | -------------------------------- |
| `ZIGBEE_SERIAL_PORT` | `COM5`             | `/dev/ttyUSB0` or `/dev/ttyACM0` |
| `ZIGBEE_BAUD_RATE`   | `115200`           | `115200`                         |
| `ZIGBEE_ADAPTER`     | `ember`            | `ember`                          |
| `ZIGBEE_DB_PATH`     | `./data/zigbee.db` | `./data/zigbee.db`               |
| `LOG_LEVEL`          | `info`             | `info` (or `debug` for verbose)  |

**Finding your serial port:**

- **Windows:** Open Device Manager → Ports (COM & LPT) → look for _Silicon Labs_ or _Sonoff_ → note the COM number.
- **Linux:** Run `ls /dev/ttyUSB* /dev/ttyACM*` or `dmesg | grep tty` after plugging in the dongle.

### 3. Run

**Development mode (ts-node, no build step):**

```bash
npm run dev
```

**Production mode (compile first):**

```bash
npm run build
npm start
```

### 4. Use the menu

```
╔═══════════════════════════════════════════════════════════╗
║          🏠  domhome-cli  –  Zigbee Shell  v0.1          ║
╚═══════════════════════════════════════════════════════════╝

? domhome-cli — Main Menu (Use arrow keys)
❯ 🚀  Start Zigbee coordinator
  📜  Show live logs info
  🚪  Exit (graceful shutdown)
```

After starting the coordinator, additional options appear:

- **Enable pairing** – enter duration in seconds; then put your Zigbee device into pairing mode.
- **List devices** – see all paired devices with details.
- **Control a device** – pick a device from the list, then choose ON / OFF / Toggle.

## Project Structure

```
src/
├── index.ts                 Entry-point: banner, config, menu loop
├── config.ts                .env parsing & validation
├── zigbee/
│   ├── coordinator.ts       zigbee-herdsman Controller lifecycle
│   ├── deviceRegistry.ts    Device listing, lookup, typed wrappers
│   └── actions.ts           On/Off ZCL commands
├── cli/
│   ├── menu.ts              Inquirer main-menu loop
│   └── screens.ts           Individual screen implementations
└── utils/
    ├── logger.ts            Pino logger setup
    └── errors.ts            Custom error classes
```

## How On/Off Control Works

1. The `DeviceRegistry` scans each device's endpoints for the **genOnOff** input cluster (ZCL cluster ID `6`).
2. When you select "Control a device", only devices with On/Off support are selectable.
3. The `actions.ts` module calls `endpoint.command('genOnOff', '<action>', {})` where `<action>` is `on`, `off`, or `toggle`.
4. This sends a standard ZCL cluster-specific command frame to the device's endpoint.

## Adapter Compatibility

| Dongle                     | Adapter setting | Notes                                             |
| -------------------------- | --------------- | ------------------------------------------------- |
| Sonoff ZBDongle-E          | `ember` ✅      | EmberZNet / Silicon Labs EFR32 (firmware ≥ 7.4.x) |
| Sonoff ZBDongle-E (old FW) | `ezsp`          | Legacy, deprecated — use `ember` if possible      |
| Sonoff ZBDongle-P          | `zstack`        | Texas Instruments CC2652                          |
| ConBee II / III            | `deconz`        | Dresden Elektronik                                |

## Troubleshooting

| Error                                     | Fix                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Serial port not found_                   | Check `ZIGBEE_SERIAL_PORT` in `.env`. Make sure the dongle is plugged in.                                                                                      |
| _Permission denied_                       | Linux: `sudo chmod 666 /dev/ttyUSB0` or add your user to the `dialout` group.                                                                                  |
| _Port is busy_                            | Close Zigbee2MQTT, ZHA, or any other program using the same port.                                                                                              |
| _Failure to connect_ / _Gecko Bootloader_ | Dongle is stuck in bootloader. Switch to `ZIGBEE_ADAPTER=ember`, unplug the dongle for 5 s, plug it back in, and retry. If it persists, re-flash the firmware. |
| _ezsp driver is deprecated_               | Set `ZIGBEE_ADAPTER=ember` in `.env`. The `ember` adapter replaces the legacy `ezsp` driver for firmware ≥ 7.4.x.                                              |
| _Interview failed_                        | Device may be too far away. Move it closer to the coordinator and try again.                                                                                   |

## Scripts

| Script          | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Run directly with ts-node (no build) |
| `npm run build` | Compile TypeScript to `dist/`        |
| `npm start`     | Run the compiled JS from `dist/`     |
| `npm run clean` | Delete `dist/` folder                |

## License

MIT
