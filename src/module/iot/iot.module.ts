// src/module/iot/iot.module.ts
import { Module } from '@nestjs/common';
import { IotController } from './iot.controller';
import { CognitoIdentityService } from '../../common/aws/cognito-identity.service';

@Module({
  controllers: [IotController],
  providers  : [CognitoIdentityService],
})
export class IotModule {}
