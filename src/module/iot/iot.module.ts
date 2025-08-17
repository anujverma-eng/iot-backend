// src/module/iot/iot.module.ts
import { Module } from '@nestjs/common';
import { IotController } from './iot.controller';
import { CognitoIdentityService } from '../../common/aws/cognito-identity.service';
import { IotSimService } from './iot-sim.service';

@Module({
  controllers: [IotController],
  providers  : [CognitoIdentityService, IotSimService],
  exports    : [IotSimService],
})
export class IotModule {}
