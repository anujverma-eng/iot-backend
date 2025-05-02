import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RogueGateway,
  RogueGatewaySchema,
} from './rogueGateways.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RogueGateway.name, schema: RogueGatewaySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class RogueGatewaysModule {}
