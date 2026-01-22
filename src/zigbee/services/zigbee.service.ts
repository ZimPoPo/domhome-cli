import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Controller, type Models } from 'zigbee-herdsman';
import * as zhc from 'zigbee-herdsman-converters';
import {
  ZigbeeCoordinatorConfig,
  ZigbeeDevice,
  ZigbeeDeviceState,
  ZigbeeDeviceType,
  ZigbeeEvent,
} from '../types';

type Device = Models.Device;

@Injectable()
export class ZigbeeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZigbeeService.name);
  private controller: Controller | null = null;
  private devices: Map<string, ZigbeeDevice> = new Map();
  private permitJoinEnabled = false;
  private isStarted = false;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit(): Promise<void> {
    // Démarrage automatique du coordinateur
    try {
      await this.start();
    } catch (error) {
      this.logger.error('Impossible de démarrer le coordinateur Zigbee', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /**
   * Démarre le coordinateur Zigbee
   */
  async start(config?: Partial<ZigbeeCoordinatorConfig>): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('Le coordinateur Zigbee est déjà démarré');
      return;
    }

    const defaultConfig: ZigbeeCoordinatorConfig = {
      port: process.env.ZIGBEE_PORT || 'COM5', // Sonoff Zigbee 3.0 USB Dongle Plus
      panId: parseInt(process.env.ZIGBEE_PAN_ID || '6754', 10),
      channel: parseInt(process.env.ZIGBEE_CHANNEL || '11', 10),
      databasePath: process.env.ZIGBEE_DB_PATH || './data/zigbee.db',
      databaseBackupPath:
        process.env.ZIGBEE_DB_BACKUP_PATH || './data/zigbee_backup.db',
      backupPath:
        process.env.ZIGBEE_BACKUP_PATH ||
        './data/zigbee_coordinator_backup.json',
      adapter:
        (process.env.ZIGBEE_ADAPTER as ZigbeeCoordinatorConfig['adapter']) ||
        'ember', // Ember pour Sonoff Dongle Plus (Silicon Labs EFR32MG21)
      // Clé réseau par défaut (16 octets) - change-la en production
      networkKey: [0x01, 0x03, 0x05, 0x07, 0x09, 0x0B, 0x0D, 0x0F, 0x00, 0x02, 0x04, 0x06, 0x08, 0x0A, 0x0C, 0x0D],
    };

    const finalConfig = { ...defaultConfig, ...config };

    this.logger.log(
      `Démarrage du coordinateur Zigbee Sonoff Dongle Plus sur ${finalConfig.port}...`,
    );

    try {
      this.controller = new Controller({
        serialPort: {
          path: finalConfig.port,
          baudRate: 115200,
          rtscts: false,
          adapter: 'ezsp', // EZSP pour Sonoff Dongle Plus (ancien firmware)
        },
        adapter: {
          concurrent: 16,
          delay: 50,
          disableLED: false,
        },
        databasePath: finalConfig.databasePath!,
        databaseBackupPath: finalConfig.databaseBackupPath!,
        backupPath: finalConfig.backupPath!,
        network: {
          panID: finalConfig.panId!,
          channelList: [finalConfig.channel!],
          networkKey: finalConfig.networkKey,
        },
        acceptJoiningDeviceHandler: async () => true,
      });

      this.setupEventListeners();

      await this.controller.start();
      this.isStarted = true;

      // Charger les appareils existants
      await this.loadExistingDevices();

      this.logger.log('Coordinateur Zigbee démarré avec succès');
      
      // Afficher tous les appareils trouvés
      this.displayAllDevices();
    } catch (error) {
      this.logger.error(
        'Erreur lors du démarrage du coordinateur Zigbee',
        error,
      );
      throw error;
    }
  }

  /**
   * Arrête le coordinateur Zigbee
   */
  async stop(): Promise<void> {
    if (!this.controller || !this.isStarted) {
      return;
    }

    this.logger.log('Arrêt du coordinateur Zigbee...');

    try {
      await this.controller.stop();
      this.isStarted = false;
      this.devices.clear();
      this.logger.log('Coordinateur Zigbee arrêté');
    } catch (error) {
      this.logger.error("Erreur lors de l'arrêt du coordinateur Zigbee", error);
      throw error;
    }
  }

  /**
   * Active/désactive le mode appairage
   */
  async permitJoin(permit: boolean, timeout = 254): Promise<void> {
    if (!this.controller || !this.isStarted) {
      throw new Error("Le coordinateur Zigbee n'est pas démarré");
    }

    await this.controller.permitJoin(permit ? timeout : 0);
    this.permitJoinEnabled = permit;

    this.eventEmitter.emit(ZigbeeEvent.PERMIT_JOIN_CHANGED, {
      permitJoin: permit,
      timeout: permit ? timeout : undefined,
    });

    this.logger.log(
      `Mode appairage ${permit ? 'activé' : 'désactivé'}${permit ? ` pour ${timeout}s` : ''}`,
    );
  }

  /**
   * Retourne l'état du mode appairage
   */
  isPermitJoinEnabled(): boolean {
    return this.permitJoinEnabled;
  }

  /**
   * Retourne tous les appareils connectés
   */
  getDevices(): ZigbeeDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Retourne un appareil par son adresse IEEE
   */
  getDevice(ieeeAddr: string): ZigbeeDevice | undefined {
    return this.devices.get(ieeeAddr);
  }

  /**
   * Retourne le contrôleur Zigbee brut (pour usage avancé)
   */
  getController(): Controller | null {
    return this.controller;
  }

  /**
   * Retourne un appareil Herdsman par son adresse IEEE
   */
  getHerdsmanDevice(ieeeAddr: string): Device | undefined {
    if (!this.controller) return undefined;
    return this.controller.getDeviceByIeeeAddr(ieeeAddr);
  }

  /**
   * Retourne la définition du convertisseur pour un appareil
   */
  async getDeviceDefinition(
    device: Device,
  ): Promise<zhc.Definition | undefined> {
    return await zhc.findByDevice(device);
  }

  /**
   * Configure les écouteurs d'événements du contrôleur
   */
  private setupEventListeners(): void {
    if (!this.controller) return;

    this.controller.on('deviceJoined', async (payload) => {
      this.logger.log(`Nouvel appareil rejoint: ${payload.device.ieeeAddr}`);
      const device = await this.mapDevice(payload.device);
      this.devices.set(device.ieeeAddr, device);
      this.eventEmitter.emit(ZigbeeEvent.DEVICE_JOINED, { device });
    });

    this.controller.on('deviceLeave', (payload) => {
      this.logger.log(`Appareil parti: ${payload.ieeeAddr}`);
      this.devices.delete(payload.ieeeAddr);
      this.eventEmitter.emit(ZigbeeEvent.DEVICE_LEFT, {
        ieeeAddr: payload.ieeeAddr,
      });
    });

    this.controller.on('deviceInterview', async (payload) => {
      const status = payload.status;
      this.logger.log(
        `Interview appareil ${payload.device.ieeeAddr}: ${status}`,
      );

      if (status === 'successful') {
        const device = await this.mapDevice(payload.device);
        this.devices.set(device.ieeeAddr, device);
      }

      this.eventEmitter.emit(ZigbeeEvent.DEVICE_INTERVIEW, {
        device: await this.mapDevice(payload.device),
        status,
      });
    });

    this.controller.on('deviceAnnounce', async (payload) => {
      this.logger.log(`Annonce appareil: ${payload.device.ieeeAddr}`);
      const device = await this.mapDevice(payload.device);
      this.devices.set(device.ieeeAddr, device);
      this.eventEmitter.emit(ZigbeeEvent.DEVICE_ANNOUNCE, { device });
    });

    this.controller.on('message', (payload) => {
      const device = this.devices.get(payload.device.ieeeAddr);
      if (device) {
        device.lastSeen = new Date();
        this.eventEmitter.emit(ZigbeeEvent.MESSAGE, {
          device,
          type: payload.type,
          cluster: payload.cluster,
          data: payload.data,
          meta: payload.meta,
        });
      }
    });

    this.controller.on('adapterDisconnected', () => {
      this.logger.error('Adaptateur Zigbee déconnecté');
      this.isStarted = false;
      this.eventEmitter.emit(ZigbeeEvent.ADAPTER_DISCONNECTED, {});
    });
  }

  /**
   * Charge les appareils existants depuis la base de données
   */
  private async loadExistingDevices(): Promise<void> {
    if (!this.controller) return;

    const devices = this.controller.getDevices();
    for (const device of devices) {
      // Ignorer le coordinateur
      if (device.type === 'Coordinator') continue;

      const mappedDevice = await this.mapDevice(device);
      this.devices.set(mappedDevice.ieeeAddr, mappedDevice);
      this.logger.debug(
        `Appareil chargé: ${mappedDevice.ieeeAddr} (${mappedDevice.modelId || 'inconnu'})`,
      );
    }

    this.logger.log(`${this.devices.size} appareil(s) chargé(s)`);
  }

  /**
   * Affiche tous les appareils Zigbee détectés
   */
  private displayAllDevices(): void {
    this.logger.log('==========================================');
    this.logger.log('📡 SCAN ZIGBEE - APPAREILS DETECTES');
    this.logger.log('==========================================');
    
    if (this.devices.size === 0) {
      this.logger.warn('❌ Aucun appareil Zigbee trouvé');
      this.logger.log('Activez le mode appairage avec permitJoin() pour ajouter des appareils');
      return;
    }

    this.devices.forEach((device, ieeeAddr) => {
      this.logger.log('');
      this.logger.log(`✅ Appareil: ${device.friendlyName || ieeeAddr}`);
      this.logger.log(`   📍 Adresse IEEE: ${ieeeAddr}`);
      this.logger.log(`   🔢 Adresse réseau: 0x${device.networkAddress.toString(16).padStart(4, '0')}`);
      this.logger.log(`   🏷️  Type: ${device.type}`);
      this.logger.log(`   🏭 Fabricant: ${device.manufacturerName || 'Inconnu'}`);
      this.logger.log(`   📦 Modèle: ${device.modelId || 'Inconnu'}`);
      this.logger.log(`   🔋 Source d'alimentation: ${device.powerSource || 'Inconnue'}`);
      this.logger.log(`   ✔️  Interview terminée: ${device.interviewCompleted ? 'Oui' : 'Non'}`);
      if (device.lastSeen) {
        this.logger.log(`   🕐 Dernière vue: ${device.lastSeen.toLocaleString('fr-FR')}`);
      }
    });
    
    this.logger.log('');
    this.logger.log('==========================================');
    this.logger.log(`📊 TOTAL: ${this.devices.size} appareil(s) Zigbee`);
    this.logger.log('==========================================');
  }

  /**
   * Convertit un appareil Herdsman en ZigbeeDevice
   */
  private async mapDevice(device: Device): Promise<ZigbeeDevice> {
    // InterviewState.Successful signifie que l'interview est terminé
    const interviewCompleted = device.interviewState === 'SUCCESSFUL';

    return {
      ieeeAddr: device.ieeeAddr,
      networkAddress: device.networkAddress,
      friendlyName: device.ieeeAddr, // Peut être personnalisé plus tard
      manufacturerName: device.manufacturerName,
      modelId: device.modelID,
      type: await this.determineDeviceType(device),
      powerSource: device.powerSource,
      interviewCompleted,
      lastSeen: device.lastSeen ? new Date(device.lastSeen) : undefined,
      state: {},
    };
  }

  /**
   * Détermine le type d'appareil basé sur ses caractéristiques
   */
  private async determineDeviceType(device: Device): Promise<ZigbeeDeviceType> {
    const definition = await zhc.findByDevice(device);
    if (!definition) return ZigbeeDeviceType.UNKNOWN;

    const exposes = definition.exposes;
    if (!exposes) return ZigbeeDeviceType.UNKNOWN;

    // exposes peut être un tableau ou une fonction
    const exposesArray =
      typeof exposes === 'function' ? exposes(device, {}) : exposes;

    for (const expose of exposesArray) {
      if ('type' in expose) {
        if (expose.type === 'light') return ZigbeeDeviceType.LIGHT;
        if (expose.type === 'switch') return ZigbeeDeviceType.PLUG;
      }
      if ('name' in expose && expose.name === 'power') {
        return ZigbeeDeviceType.PLUG;
      }
    }

    return ZigbeeDeviceType.UNKNOWN;
  }

  /**
   * Met à jour l'état d'un appareil en cache
   */
  updateDeviceState(ieeeAddr: string, state: Partial<ZigbeeDeviceState>): void {
    const device = this.devices.get(ieeeAddr);
    if (device) {
      device.state = { ...device.state, ...state };
      device.lastSeen = new Date();
      this.eventEmitter.emit(ZigbeeEvent.STATE_CHANGE, {
        device,
        state: device.state,
      });
    }
  }
}
