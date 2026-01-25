import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { SensorTimeoutCronService } from './sensor-timeout-cron.service';
import { AlertRule, AlertRuleSchema } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistorySchema } from './schemas/alert-history.schema';
import { Sensor, SensorSchema } from '../sensors/sensors.schema';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
import { Membership, MembershipSchema } from '../memberships/memberships.schema';
import { Settings, SettingsSchema } from '../settings/settings.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: AlertRule.name, schema: AlertRuleSchema },
      { name: AlertHistory.name, schema: AlertHistorySchema },
      { name: Sensor.name, schema: SensorSchema },
      { name: Gateway.name, schema: GatewaySchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Settings.name, schema: SettingsSchema },
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, SensorTimeoutCronService],
  exports: [AlertsService],
})
export class AlertsModule {}

