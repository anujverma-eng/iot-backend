import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sensor, SensorSchema } from './sensors.schema';
import { SensorsService } from './sensors.service';
import { SensorsController } from './sensors.controller';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { Telemetry, TelemetrySchema } from '../telemetry/telemetry.schema';
import { SettingsService } from '../settings/settings.service';
import { Settings, SettingsSchema } from '../settings/settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Sensor.name, schema: SensorSchema },
        { name: Gateway.name, schema: GatewaySchema },
        { name: User.name, schema: UserSchema },
        { name: Organization.name, schema: OrganizationSchema },
        { name: Telemetry.name, schema: TelemetrySchema },
        { name: Settings.name, schema: SettingsSchema },
      ]
    ),
  ],
  providers: [SensorsService, UsersService, SettingsService],
  controllers: [SensorsController],
  exports: [MongooseModule],
})
export class SensorsModule {}
