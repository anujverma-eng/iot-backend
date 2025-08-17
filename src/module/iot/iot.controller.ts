// src/module/iot/iot.controller.ts
import { Controller, Get, Post, Delete, Body, Req, UseGuards } from '@nestjs/common';
import { CognitoIdentityService } from '../../common/aws/cognito-identity.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IotSimService, GatewayConfig } from './iot-sim.service';
import { Public } from '../auth/public.decorator';

@Controller('iot')
@UseGuards(JwtAuthGuard)
export class IotController {
  constructor(
    private readonly idSvc: CognitoIdentityService,
    private readonly cfg  : ConfigService,
    private readonly simSvc: IotSimService,
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

  @Public()
  @Post('simulator/start')
  async startSimulator(@Body() body: { gateways: string[]; intervalSeconds?: number }) {
    const { gateways, intervalSeconds = 1 } = body;
    this.simSvc.start(gateways, intervalSeconds);
    return { message: 'Simulator started', gateways, intervalSeconds };
  }

  @Public()
  @Post('simulator/start-with-config')
  async startSimulatorWithConfig(@Body() body: { gatewayConfigs: GatewayConfig[]; intervalSeconds?: number }) {
    const { gatewayConfigs, intervalSeconds = 1 } = body;
    this.simSvc.startWithConfig(gatewayConfigs, intervalSeconds);
    return { 
      message: 'Simulator started with custom configurations', 
      gateways: gatewayConfigs.map(gc => gc.gatewayId), 
      intervalSeconds 
    };
  }

  @Public()
  @Post('simulator/config')
  async setSensorConfig(@Body() body: { gatewayConfigs: GatewayConfig[] }) {
    const { gatewayConfigs } = body;
    this.simSvc.setSensorConfig(gatewayConfigs);
    return { 
      message: 'Sensor configurations updated', 
      gateways: gatewayConfigs.map(gc => gc.gatewayId),
    };
  }

  @Public()
  @Delete('simulator/stop')
  async stopSimulator() {
    this.simSvc.stop();
    return { message: 'Simulator stopped' };
  }
}
