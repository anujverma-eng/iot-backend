// src/module/iot/iot.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { CognitoIdentityService } from '../../common/aws/cognito-identity.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('iot')
@UseGuards(JwtAuthGuard)
export class IotController {
  constructor(
    private readonly idSvc: CognitoIdentityService,
    private readonly cfg  : ConfigService,
  ) {}

  @Get('ws-credentials')
  async getWsCreds(@Req() req: any) {
    const idToken = req.headers.authorization!.split(' ')[1];
    const creds   = await this.idSvc.getTempCreds(idToken);

    return {
      endpoint : this.cfg.get('iot.endpoint'),
      region   : this.cfg.get('aws.region'),
      clientId : `${req.user.sub}-${Date.now()}`,
      creds,
    };
  }
}
