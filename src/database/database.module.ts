import { Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { LoggerModule } from '../common/logger/logger.module';
import { LoggerService } from '../common/logger/logger.service';

@Module({
  imports: [
    // async so we can pull the URI from ConfigService
    LoggerModule,
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongo.uri'),
        // dbName: 'iot',
        // uriDecodeAuth: true,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    // If the connection is already up (readyState === 1), log right away.
    if (this.conn.readyState === 1) {
      this.logger.log(
        '✅  MongoDB connection established',
        DatabaseModule.name,
      );
    } else {
      // Otherwise wait for the first 'connected' event.
      this.conn.once('connected', () =>
        this.logger.log(
          '✅  MongoDB connection established',
          DatabaseModule.name,
        ),
      );
    }

    this.conn.on('disconnected', () =>
      this.logger.warn('⚠️  MongoDB disconnected', DatabaseModule.name),
    );
    this.conn.on('reconnected', () =>
      this.logger.log('🔄  MongoDB re‑connected', DatabaseModule.name),
    );
    this.conn.once('connected', () =>
      this.logger.log(
        '✅  MongoDB connection established',
        DatabaseModule.name,
      ),
    );
    this.conn.on('error', (err) =>
      this.logger.error(
        `❌  MongoDB connection error: ${err}`,
        undefined,
        DatabaseModule.name,
      ),
    );
  }
}
