import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertRule, AlertRuleSchema } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistorySchema } from './schemas/alert-history.schema';
import { Sensor, SensorSchema } from '../sensors/sensors.schema';
import { Gateway, GatewaySchema } from '../gateways/gateways.schema';
import { Membership, MembershipSchema } from '../memberships/memberships.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AlertRule.name, schema: AlertRuleSchema },
      { name: AlertHistory.name, schema: AlertHistorySchema },
      { name: Sensor.name, schema: SensorSchema },
      { name: Gateway.name, schema: GatewaySchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
