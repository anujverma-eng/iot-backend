import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { HealthModule } from './module/health/health.module';
import { PlansModule } from './module/plans/plans.module';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, HealthModule, PlansModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
