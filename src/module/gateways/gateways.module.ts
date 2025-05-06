import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Gateway, GatewaySchema } from './gateways.schema';
import { GatewaysController } from './gateways.controller';
import { GatewaysService } from './gateways.service';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/organizations.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Gateway.name, schema: GatewaySchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [GatewaysController],
  providers: [GatewaysService],
  exports: [MongooseModule, GatewaysService],
})
export class GatewaysModule {}
