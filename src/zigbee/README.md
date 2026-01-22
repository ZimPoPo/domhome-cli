# Module Zigbee - DomHome

Ce module fournit une interface pour communiquer avec des appareils Zigbee via `zigbee-herdsman` et `zigbee-herdsman-converters`.

## Configuration

Copiez `.env.example` vers `.env` et configurez les variables selon votre setup :

```bash
cp .env.example .env
```

### Variables d'environnement

| Variable         | Description                  | Valeur par défaut  |
| ---------------- | ---------------------------- | ------------------ |
| `ZIGBEE_PORT`    | Port série du coordinateur   | `COM3`             |
| `ZIGBEE_PAN_ID`  | ID du réseau PAN             | `6754`             |
| `ZIGBEE_CHANNEL` | Canal Zigbee (11-26)         | `11`               |
| `ZIGBEE_DB_PATH` | Chemin de la base de données | `./data/zigbee.db` |

## Utilisation

### Injection des services

```typescript
import { Injectable } from '@nestjs/common';
import { ZigbeeService, ZigbeeDeviceService } from './zigbee';

@Injectable()
export class MyService {
  constructor(
    private readonly zigbeeService: ZigbeeService,
    private readonly zigbeeDeviceService: ZigbeeDeviceService,
  ) {}
}
```

### Démarrer le coordinateur

```typescript
// Démarrage avec configuration par défaut (variables d'environnement)
await this.zigbeeService.start();

// Ou avec une configuration personnalisée
await this.zigbeeService.start({
  port: 'COM4',
  channel: 15,
});
```

### Mode appairage

```typescript
// Activer le mode appairage pendant 60 secondes
await this.zigbeeService.permitJoin(true, 60);

// Désactiver le mode appairage
await this.zigbeeService.permitJoin(false);

// Vérifier si le mode appairage est actif
const isEnabled = this.zigbeeService.isPermitJoinEnabled();
```

### Lister les appareils

```typescript
// Tous les appareils
const devices = this.zigbeeService.getDevices();

// Un appareil spécifique par son adresse IEEE
const device = this.zigbeeService.getDevice('0x00158d0001234567');
```

### Contrôler une lampe

```typescript
const ieeeAddr = '0x00158d0001234567';

// Allumer
await this.zigbeeDeviceService.turnOnLight(ieeeAddr);

// Allumer avec options
await this.zigbeeDeviceService.turnOnLight(ieeeAddr, {
  brightness: 80, // 0-100%
  color_temp: 4000, // Kelvin
  transition: 1, // Transition en secondes
});

// Éteindre
await this.zigbeeDeviceService.turnOffLight(ieeeAddr);

// Basculer
await this.zigbeeDeviceService.toggleLight(ieeeAddr);

// Régler la luminosité (0-100%)
await this.zigbeeDeviceService.setBrightness(ieeeAddr, 50);

// Régler la température de couleur (en Kelvin)
await this.zigbeeDeviceService.setColorTemperature(ieeeAddr, 4000);

// Régler la couleur
await this.zigbeeDeviceService.setColor(ieeeAddr, {
  hex: '#FF5500',
  // ou rgb: { r: 255, g: 85, b: 0 },
  // ou hue: 20, saturation: 100,
});
```

### Contrôler une prise

```typescript
const ieeeAddr = '0x00158d0001234567';

// Allumer
await this.zigbeeDeviceService.turnOnPlug(ieeeAddr);

// Éteindre
await this.zigbeeDeviceService.turnOffPlug(ieeeAddr);

// Basculer
await this.zigbeeDeviceService.togglePlug(ieeeAddr);

// Lire la consommation
const consumption =
  await this.zigbeeDeviceService.readPowerConsumption(ieeeAddr);
console.log(consumption.power); // Watts
console.log(consumption.energy); // kWh
console.log(consumption.voltage); // Volts
console.log(consumption.current); // Ampères
```

### Méthodes génériques

```typescript
// Marche pour lampes et prises
await this.zigbeeDeviceService.turnOn(ieeeAddr);
await this.zigbeeDeviceService.turnOff(ieeeAddr);
await this.zigbeeDeviceService.toggle(ieeeAddr);

// Lire l'état actuel
const state = await this.zigbeeDeviceService.readState(ieeeAddr);
```

### Écouter les événements

```typescript
import { OnEvent } from '@nestjs/event-emitter';
import { ZigbeeEvent, ZigbeeEventPayload } from './zigbee';

@Injectable()
export class MyEventListener {
  @OnEvent(ZigbeeEvent.DEVICE_JOINED)
  handleDeviceJoined(payload: ZigbeeEventPayload[ZigbeeEvent.DEVICE_JOINED]) {
    console.log('Nouvel appareil:', payload.device.ieeeAddr);
  }

  @OnEvent(ZigbeeEvent.STATE_CHANGE)
  handleStateChange(payload: ZigbeeEventPayload[ZigbeeEvent.STATE_CHANGE]) {
    console.log(`${payload.device.ieeeAddr}:`, payload.state);
  }

  @OnEvent(ZigbeeEvent.MESSAGE)
  handleMessage(payload: ZigbeeEventPayload[ZigbeeEvent.MESSAGE]) {
    console.log('Message reçu:', payload);
  }
}
```

### Événements disponibles

| Événement                     | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `zigbee.device.joined`        | Un nouvel appareil a rejoint le réseau              |
| `zigbee.device.left`          | Un appareil a quitté le réseau                      |
| `zigbee.device.interview`     | Interview d'un appareil (started/successful/failed) |
| `zigbee.device.announce`      | Un appareil s'est annoncé                           |
| `zigbee.message`              | Message reçu d'un appareil                          |
| `zigbee.state.change`         | Changement d'état d'un appareil                     |
| `zigbee.adapter.disconnected` | L'adaptateur s'est déconnecté                       |
| `zigbee.permitJoin.changed`   | Le mode appairage a changé                          |

## Coordinateurs supportés

- Texas Instruments CC2531/CC2652
- Silicon Labs EFR32 (EZSP/EmberZNet)
- Dresden Elektronik ConBee/RaspBee
- ZiGate

## Structure des fichiers

```
src/zigbee/
├── index.ts                     # Exports publics
├── zigbee.module.ts             # Module NestJS
├── services/
│   ├── index.ts
│   ├── zigbee.service.ts        # Service principal (coordinateur)
│   └── zigbee-device.service.ts # Service de contrôle des appareils
└── types/
    ├── index.ts
    └── zigbee.types.ts          # Types et interfaces
```
