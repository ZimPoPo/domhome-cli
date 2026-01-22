import { Module } from '@nestjs/common';
import { ZigbeeDeviceService } from './services/zigbee-device.service';
import { ZigbeeService } from './services/zigbee.service';

@Module({
  providers: [ZigbeeService, ZigbeeDeviceService],
  exports: [ZigbeeService, ZigbeeDeviceService],
})
export class ZigbeeModule {}
