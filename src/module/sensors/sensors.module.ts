import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sensor, SensorSchema } from './sensors.schema';
import { SensorsService } from './sensors.service';
import { SensorsController } from './sensors.controller';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Sensor.name, schema: SensorSchema },
        { name: Gateway.name, schema: GatewaySchema },
        { name: User.name, schema: UserSchema },
        { name: Organization.name, schema: OrganizationSchema },
      ]
    ),
  ],
  providers: [SensorsService, UsersService],
  controllers: [SensorsController],
  exports: [MongooseModule],
})
export class SensorsModule {}
