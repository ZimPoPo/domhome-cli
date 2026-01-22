import { Injectable, Logger } from '@nestjs/common';
import * as zhc from 'zigbee-herdsman-converters';
import {
  LightControlOptions,
  PlugControlOptions,
  ZigbeeDevicePowerState,
  ZigbeeDeviceState,
} from '../types';
import { ZigbeeService } from './zigbee.service';

@Injectable()
export class ZigbeeDeviceService {
  private readonly logger = new Logger(ZigbeeDeviceService.name);

  constructor(private readonly zigbeeService: ZigbeeService) {}

  /**
   * Envoie une commande à un appareil via les convertisseurs
   */
  private async sendCommand(
    ieeeAddr: string,
    command: string,
    value: unknown,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const herdsmanDevice = this.zigbeeService.getHerdsmanDevice(ieeeAddr);
    if (!herdsmanDevice) {
      throw new Error(`Appareil non trouvé: ${ieeeAddr}`);
    }

    const definition =
      await this.zigbeeService.getDeviceDefinition(herdsmanDevice);
    if (!definition) {
      throw new Error(`Définition non trouvée pour l'appareil: ${ieeeAddr}`);
    }

    const endpoint =
      herdsmanDevice.getEndpoint(1) || herdsmanDevice.endpoints[0];
    if (!endpoint) {
      throw new Error(`Endpoint non trouvé pour l'appareil: ${ieeeAddr}`);
    }

    // Trouver le convertisseur approprié
    const converter = definition.toZigbee?.find((c) =>
      c.key?.includes(command),
    );

    if (!converter) {
      throw new Error(`Convertisseur non trouvé pour la commande: ${command}`);
    }

    // Fonction publish vide (utilisée par certains convertisseurs pour envoyer des messages)
    const publish = () => Promise.resolve();

    const meta: zhc.Tz.Meta = {
      state: {},
      device: herdsmanDevice,
      mapped: definition,
      options: {},
      message: { [command]: value, ...options },
      endpoint_name: 'default',
      publish,
    };

    try {
      const result = await converter.convertSet?.(
        endpoint,
        command,
        value,
        meta,
      );

      // Mettre à jour l'état en cache
      if (result?.state) {
        this.zigbeeService.updateDeviceState(
          ieeeAddr,
          result.state as ZigbeeDeviceState,
        );
      }

      this.logger.debug(
        `Commande ${command}=${JSON.stringify(value)} envoyée à ${ieeeAddr}`,
      );
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi de la commande à ${ieeeAddr}`,
        error,
      );
      throw error;
    }
  }

  // ==================== CONTRÔLE DES LAMPES ====================

  /**
   * Allume une lampe
   */
  async turnOnLight(
    ieeeAddr: string,
    options?: Partial<LightControlOptions>,
  ): Promise<void> {
    await this.sendCommand(
      ieeeAddr,
      'state',
      ZigbeeDevicePowerState.ON,
      options,
    );

    if (options?.brightness !== undefined) {
      await this.setBrightness(
        ieeeAddr,
        options.brightness,
        options.transition,
      );
    }

    if (options?.color_temp !== undefined) {
      await this.setColorTemperature(
        ieeeAddr,
        options.color_temp,
        options.transition,
      );
    }

    if (options?.color) {
      await this.setColor(ieeeAddr, options.color, options.transition);
    }
  }

  /**
   * Éteint une lampe
   */
  async turnOffLight(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.OFF);
  }

  /**
   * Bascule l'état d'une lampe
   */
  async toggleLight(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.TOGGLE);
  }

  /**
   * Définit la luminosité d'une lampe (0-100%)
   */
  async setBrightness(
    ieeeAddr: string,
    brightness: number,
    transition?: number,
  ): Promise<void> {
    // Convertir de 0-100 à 0-254
    const zigbeeBrightness = Math.round((brightness / 100) * 254);
    const clampedBrightness = Math.max(0, Math.min(254, zigbeeBrightness));

    const options: Record<string, unknown> = {};
    if (transition !== undefined) {
      options.transition = transition;
    }

    await this.sendCommand(ieeeAddr, 'brightness', clampedBrightness, options);
  }

  /**
   * Définit la température de couleur (en Kelvin ou mireds)
   */
  async setColorTemperature(
    ieeeAddr: string,
    colorTemp: number,
    transition?: number,
  ): Promise<void> {
    // Si > 500, on considère que c'est en Kelvin, sinon en mireds
    const mireds =
      colorTemp > 500 ? Math.round(1000000 / colorTemp) : colorTemp;

    const options: Record<string, unknown> = {};
    if (transition !== undefined) {
      options.transition = transition;
    }

    await this.sendCommand(ieeeAddr, 'color_temp', mireds, options);
  }

  /**
   * Définit la couleur d'une lampe
   */
  async setColor(
    ieeeAddr: string,
    color: LightControlOptions['color'],
    transition?: number,
  ): Promise<void> {
    if (!color) return;

    const options: Record<string, unknown> = {};
    if (transition !== undefined) {
      options.transition = transition;
    }

    if (color.hex) {
      await this.sendCommand(ieeeAddr, 'color', { hex: color.hex }, options);
    } else if (color.rgb) {
      await this.sendCommand(
        ieeeAddr,
        'color',
        { rgb: `${color.rgb.r},${color.rgb.g},${color.rgb.b}` },
        options,
      );
    } else if (color.hue !== undefined && color.saturation !== undefined) {
      await this.sendCommand(
        ieeeAddr,
        'color',
        { hue: color.hue, saturation: color.saturation },
        options,
      );
    }
  }

  // ==================== CONTRÔLE DES PRISES ====================

  /**
   * Allume une prise
   */
  async turnOnPlug(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.ON);
  }

  /**
   * Éteint une prise
   */
  async turnOffPlug(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.OFF);
  }

  /**
   * Bascule l'état d'une prise
   */
  async togglePlug(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.TOGGLE);
  }

  /**
   * Contrôle une prise avec options
   */
  async controlPlug(
    ieeeAddr: string,
    options: PlugControlOptions,
  ): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', options.state);
  }

  // ==================== MÉTHODES GÉNÉRIQUES ====================

  /**
   * Allume un appareil (lampe ou prise)
   */
  async turnOn(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.ON);
  }

  /**
   * Éteint un appareil (lampe ou prise)
   */
  async turnOff(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.OFF);
  }

  /**
   * Bascule l'état d'un appareil (lampe ou prise)
   */
  async toggle(ieeeAddr: string): Promise<void> {
    await this.sendCommand(ieeeAddr, 'state', ZigbeeDevicePowerState.TOGGLE);
  }

  // ==================== LECTURE D'ÉTAT ====================

  /**
   * Lit l'état actuel d'un appareil depuis le réseau
   */
  async readState(ieeeAddr: string): Promise<ZigbeeDeviceState | null> {
    const herdsmanDevice = this.zigbeeService.getHerdsmanDevice(ieeeAddr);
    if (!herdsmanDevice) {
      throw new Error(`Appareil non trouvé: ${ieeeAddr}`);
    }

    const endpoint =
      herdsmanDevice.getEndpoint(1) || herdsmanDevice.endpoints[0];
    if (!endpoint) {
      throw new Error(`Endpoint non trouvé pour l'appareil: ${ieeeAddr}`);
    }

    try {
      const state: ZigbeeDeviceState = {};

      // Lire l'état on/off
      try {
        const onOffResult = await endpoint.read('genOnOff', ['onOff']);
        state.state = onOffResult.onOff
          ? ZigbeeDevicePowerState.ON
          : ZigbeeDevicePowerState.OFF;
      } catch {
        // Cluster non supporté
      }

      // Lire la luminosité
      try {
        const levelResult = await endpoint.read('genLevelCtrl', [
          'currentLevel',
        ]);
        state.brightness = levelResult.currentLevel as number;
      } catch {
        // Cluster non supporté
      }

      // Lire la température de couleur
      try {
        const colorTempResult = await endpoint.read('lightingColorCtrl', [
          'colorTemperature',
        ]);
        state.color_temp = colorTempResult.colorTemperature as number;
      } catch {
        // Cluster non supporté
      }

      // Mettre à jour le cache
      this.zigbeeService.updateDeviceState(ieeeAddr, state);

      return state;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la lecture de l'état de ${ieeeAddr}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Lit la consommation électrique d'une prise
   */
  async readPowerConsumption(ieeeAddr: string): Promise<{
    power?: number;
    energy?: number;
    voltage?: number;
    current?: number;
  }> {
    const herdsmanDevice = this.zigbeeService.getHerdsmanDevice(ieeeAddr);
    if (!herdsmanDevice) {
      throw new Error(`Appareil non trouvé: ${ieeeAddr}`);
    }

    const endpoint =
      herdsmanDevice.getEndpoint(1) || herdsmanDevice.endpoints[0];
    if (!endpoint) {
      throw new Error(`Endpoint non trouvé pour l'appareil: ${ieeeAddr}`);
    }

    const result: {
      power?: number;
      energy?: number;
      voltage?: number;
      current?: number;
    } = {};

    try {
      // Lire la puissance instantanée
      try {
        const powerResult = await endpoint.read('haElectricalMeasurement', [
          'activePower',
          'rmsVoltage',
          'rmsCurrent',
        ]);
        result.power = (powerResult.activePower as number) / 10;
        result.voltage = (powerResult.rmsVoltage as number) / 10;
        result.current = (powerResult.rmsCurrent as number) / 1000;
      } catch {
        // Cluster non supporté
      }

      // Lire l'énergie cumulée
      try {
        const energyResult = await endpoint.read('seMetering', [
          'currentSummDelivered',
        ]);
        const delivered = energyResult.currentSummDelivered as number;
        result.energy = delivered / 100;
      } catch {
        // Cluster non supporté
      }

      // Mettre à jour le cache
      this.zigbeeService.updateDeviceState(ieeeAddr, result);

      return result;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la lecture de la consommation de ${ieeeAddr}`,
        error,
      );
      throw error;
    }
  }

  // ==================== CONFIGURATION ====================

  /**
   * Configure le reporting automatique pour un appareil
   */
  async configureReporting(
    ieeeAddr: string,
    cluster: string,
    attributes: Array<{
      attribute: number | { ID: number; type: number };
      minimumReportInterval: number;
      maximumReportInterval: number;
      reportableChange: number;
    }>,
  ): Promise<void> {
    const herdsmanDevice = this.zigbeeService.getHerdsmanDevice(ieeeAddr);
    if (!herdsmanDevice) {
      throw new Error(`Appareil non trouvé: ${ieeeAddr}`);
    }

    const endpoint =
      herdsmanDevice.getEndpoint(1) || herdsmanDevice.endpoints[0];
    if (!endpoint) {
      throw new Error(`Endpoint non trouvé pour l'appareil: ${ieeeAddr}`);
    }

    try {
      await endpoint.configureReporting(cluster, attributes as never);
      this.logger.log(
        `Reporting configuré pour ${ieeeAddr} sur le cluster ${cluster}`,
      );
    } catch (error) {
      this.logger.error(
        `Erreur lors de la configuration du reporting pour ${ieeeAddr}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Bind un appareil à un autre (ex: interrupteur -> lampe)
   */
  async bind(
    sourceIeeeAddr: string,
    targetIeeeAddr: string,
    clusters: string[],
  ): Promise<void> {
    const sourceDevice = this.zigbeeService.getHerdsmanDevice(sourceIeeeAddr);
    const targetDevice = this.zigbeeService.getHerdsmanDevice(targetIeeeAddr);

    if (!sourceDevice || !targetDevice) {
      throw new Error('Appareil source ou cible non trouvé');
    }

    const sourceEndpoint =
      sourceDevice.getEndpoint(1) || sourceDevice.endpoints[0];
    const targetEndpoint =
      targetDevice.getEndpoint(1) || targetDevice.endpoints[0];

    if (!sourceEndpoint || !targetEndpoint) {
      throw new Error('Endpoint source ou cible non trouvé');
    }

    try {
      for (const cluster of clusters) {
        await sourceEndpoint.bind(cluster, targetEndpoint);
        this.logger.log(
          `Bind effectué: ${sourceIeeeAddr} -> ${targetIeeeAddr} (${cluster})`,
        );
      }
    } catch (error) {
      this.logger.error('Erreur lors du bind', error);
      throw error;
    }
  }

  /**
   * Unbind un appareil d'un autre
   */
  async unbind(
    sourceIeeeAddr: string,
    targetIeeeAddr: string,
    clusters: string[],
  ): Promise<void> {
    const sourceDevice = this.zigbeeService.getHerdsmanDevice(sourceIeeeAddr);
    const targetDevice = this.zigbeeService.getHerdsmanDevice(targetIeeeAddr);

    if (!sourceDevice || !targetDevice) {
      throw new Error('Appareil source ou cible non trouvé');
    }

    const sourceEndpoint =
      sourceDevice.getEndpoint(1) || sourceDevice.endpoints[0];
    const targetEndpoint =
      targetDevice.getEndpoint(1) || targetDevice.endpoints[0];

    if (!sourceEndpoint || !targetEndpoint) {
      throw new Error('Endpoint source ou cible non trouvé');
    }

    try {
      for (const cluster of clusters) {
        await sourceEndpoint.unbind(cluster, targetEndpoint);
        this.logger.log(
          `Unbind effectué: ${sourceIeeeAddr} -> ${targetIeeeAddr} (${cluster})`,
        );
      }
    } catch (error) {
      this.logger.error('Erreur lors du unbind', error);
      throw error;
    }
  }
}
