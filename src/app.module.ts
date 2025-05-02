import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { HealthModule } from './module/health/health.module';
import { PlansModule } from './module/plans/plans.module';
import { OrganizationsModule } from './module/organizations/organizations.module';
import { UsersModule } from './module/users/users.module';
import { GatewaysModule } from './module/gateways/gateways.module';
import { SensorsModule } from './module/sensors/sensors.module';
import { NotificationsModule } from './module/notifications/notifications.module';
import { RogueGatewaysModule } from './module/rogue-gateways/rogue-gateways.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    HealthModule,
    PlansModule,
    OrganizationsModule,
    UsersModule,
    GatewaysModule,
    SensorsModule,
    NotificationsModule,
    RogueGatewaysModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
