import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sensor, SensorSchema } from './sensors.schema';
import { SensorsService } from './sensors.service';
import { SensorsController } from './sensors.controller';
import { SensorsDeveloperController } from './sensors.developer.controller';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { Telemetry, TelemetrySchema } from '../telemetry/telemetry.schema';
import { SettingsModule } from '../settings/settings.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { DeveloperModule } from '../developer/developer.module';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Sensor.name, schema: SensorSchema },
        { name: Gateway.name, schema: GatewaySchema },
        { name: User.name, schema: UserSchema },
        { name: Organization.name, schema: OrganizationSchema },
        { name: Telemetry.name, schema: TelemetrySchema },
      ]
    ),
    SettingsModule,
    forwardRef(() => TelemetryModule),
    forwardRef(() => DeveloperModule),
  ],
  providers: [SensorsService, UsersService],
  controllers: [SensorsController, SensorsDeveloperController],
  exports: [MongooseModule, SensorsService],
})
export class SensorsModule { }
