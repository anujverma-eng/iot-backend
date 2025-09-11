import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Gateway, GatewaySchema } from './gateways.schema';
import { GatewaysController } from './gateways.controller';
import { GatewaysService } from './gateways.service';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/organizations.schema';
import { CertsService } from '../certs/certs.service';
import { S3Service } from 'src/common/aws/s3.service';
import { UsersService } from '../users/users.service';
import { User, UserSchema } from '../users/users.schema';
import { Sensor, SensorSchema } from '../sensors/sensors.schema';
import { Telemetry, TelemetrySchema } from '../telemetry/telemetry.schema';
import { Membership, MembershipSchema } from '../memberships/memberships.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Gateway.name, schema: GatewaySchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
      { name: Sensor.name, schema: SensorSchema },
      { name: Telemetry.name, schema: TelemetrySchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  controllers: [GatewaysController],
  providers: [GatewaysService, CertsService, S3Service, UsersService],
  exports: [MongooseModule, GatewaysService],
})
export class GatewaysModule {}
