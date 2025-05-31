// src/module/telemetry/telemetry.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Telemetry, TelemetrySchema } from './telemetry.schema';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/users.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/organizations.schema';
import { SensorsService } from '../sensors/sensors.service';
import { Sensor, SensorSchema } from '../sensors/sensors.schema';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Sensor.name, schema: SensorSchema },
      { name: Gateway.name, schema: GatewaySchema },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, UsersService, SensorsService],
  exports: [MongooseModule, TelemetryService],
})
export class TelemetryModule {}
