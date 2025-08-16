import { Module } from '@nestjs/common';
import { IotSessionService } from './iot-session.service';
import { RealtimeController } from './realtime.controller';
import { GatewaysModule } from '../gateways/gateways.module';
import { UsersService } from '../users/users.service';

@Module({
  imports: [GatewaysModule],
  providers: [IotSessionService, UsersService],
  controllers: [RealtimeController],
  exports: [IotSessionService]
})
export class RealtimeModule {}
