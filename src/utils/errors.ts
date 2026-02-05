/**
 * errors.ts – Custom error classes for clearer error handling.
 */

/**
 * Thrown when the Zigbee coordinator cannot be reached or initialized
 * (e.g. wrong COM port, dongle not plugged in, permission denied).
 */
export class CoordinatorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CoordinatorError";
  }
}

/**
 * Thrown when a requested device cannot be found in the network.
 */
export class DeviceNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Device not found: ${identifier}`);
    this.name = "DeviceNotFoundError";
  }
}

/**
 * Thrown when attempting an unsupported action on a device
 * (e.g. sending on/off to a device without the OnOff cluster).
 */
export class UnsupportedActionError extends Error {
  constructor(action: string, deviceName: string) {
    super(`Action "${action}" is not supported on device "${deviceName}".`);
    this.name = "UnsupportedActionError";
  }
}

/**
 * Format an unknown error into a readable message.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
