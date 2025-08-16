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
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './module/auth/jwt-auth.guard';
import { RolesGuard } from './module/auth/roles.guard';
import { AuthModule } from './module/auth/auth.module';
import { TelemetryModule } from './module/telemetry/telemetry.module';
import { IotModule } from './module/iot/iot.module';
import { RealtimeModule } from './module/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    PlansModule,
    OrganizationsModule,
    UsersModule,
    GatewaysModule,
    SensorsModule,
    NotificationsModule,
    RogueGatewaysModule,
    TelemetryModule,
    IotModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide : APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide : APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
