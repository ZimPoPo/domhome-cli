/**
 * Types et interfaces pour la communication Zigbee
 */

export enum ZigbeeDeviceType {
  LIGHT = 'light',
  SWITCH = 'switch',
  PLUG = 'plug',
  SENSOR = 'sensor',
  UNKNOWN = 'unknown',
}

export enum ZigbeeDevicePowerState {
  ON = 'ON',
  OFF = 'OFF',
  TOGGLE = 'TOGGLE',
}

export interface ZigbeeDeviceState {
  state?: ZigbeeDevicePowerState;
  brightness?: number; // 0-254
  color_temp?: number; // Température de couleur en mireds
  color?: {
    x?: number;
    y?: number;
    hue?: number;
    saturation?: number;
  };
  power?: number; // Consommation en watts (pour prises)
  energy?: number; // Énergie consommée en kWh
  voltage?: number; // Tension en V
  current?: number; // Courant en A
}

export interface ZigbeeDevice {
  ieeeAddr: string; // Adresse IEEE unique
  networkAddress: number;
  friendlyName?: string;
  manufacturerName?: string;
  modelId?: string;
  type: ZigbeeDeviceType;
  powerSource?: string;
  interviewCompleted: boolean;
  lastSeen?: Date;
  state: ZigbeeDeviceState;
}

export interface ZigbeeCoordinatorConfig {
  port: string; // Port série du coordinateur (ex: COM3, /dev/ttyUSB0)
  panId?: number;
  channel?: number;
  networkKey?: number[];
  databasePath?: string;
  databaseBackupPath?: string;
  backupPath?: string;
  adapter?: 'zstack' | 'deconz' | 'zigate' | 'ezsp' | 'ember' | 'zboss';
}

export interface ZigbeeMessagePayload {
  device: ZigbeeDevice;
  type: 'attributeReport' | 'readResponse' | 'commandResponse';
  cluster: string;
  data: Record<string, unknown>;
  meta?: {
    zclTransactionSequenceNumber?: number;
    manufacturerCode?: number;
    frameControl?: unknown;
  };
}

export interface ZigbeeCommandPayload {
  ieeeAddr: string;
  command: string;
  payload: Record<string, unknown>;
  options?: {
    disableDefaultResponse?: boolean;
    timeout?: number;
  };
}

// Events émis par le service Zigbee
export enum ZigbeeEvent {
  DEVICE_JOINED = 'zigbee.device.joined',
  DEVICE_LEFT = 'zigbee.device.left',
  DEVICE_INTERVIEW = 'zigbee.device.interview',
  DEVICE_ANNOUNCE = 'zigbee.device.announce',
  MESSAGE = 'zigbee.message',
  STATE_CHANGE = 'zigbee.state.change',
  ADAPTER_DISCONNECTED = 'zigbee.adapter.disconnected',
  PERMIT_JOIN_CHANGED = 'zigbee.permitJoin.changed',
}

export interface ZigbeeEventPayload {
  [ZigbeeEvent.DEVICE_JOINED]: { device: ZigbeeDevice };
  [ZigbeeEvent.DEVICE_LEFT]: { ieeeAddr: string };
  [ZigbeeEvent.DEVICE_INTERVIEW]: {
    device: ZigbeeDevice;
    status: 'started' | 'successful' | 'failed';
  };
  [ZigbeeEvent.DEVICE_ANNOUNCE]: { device: ZigbeeDevice };
  [ZigbeeEvent.MESSAGE]: ZigbeeMessagePayload;
  [ZigbeeEvent.STATE_CHANGE]: {
    device: ZigbeeDevice;
    state: ZigbeeDeviceState;
  };
  [ZigbeeEvent.ADAPTER_DISCONNECTED]: Record<string, never>;
  [ZigbeeEvent.PERMIT_JOIN_CHANGED]: { permitJoin: boolean; timeout?: number };
}

// Options pour le contrôle des appareils
export interface LightControlOptions {
  state?: ZigbeeDevicePowerState;
  brightness?: number; // 0-100 (sera converti en 0-254)
  color_temp?: number; // Température en Kelvin ou mireds
  transition?: number; // Temps de transition en secondes
  color?: {
    hex?: string;
    rgb?: { r: number; g: number; b: number };
    hue?: number;
    saturation?: number;
  };
}

export interface PlugControlOptions {
  state: ZigbeeDevicePowerState;
}
