import { Global, Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildWinstonOptions } from './winston.config';
import { LoggerService } from './logger.service';

/**
 * A global logger so every provider can just inject LoggerService.
 */
@Global()
@Module({
  imports: [
    ConfigModule, // already global, but explicit for clarity
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildWinstonOptions,
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
