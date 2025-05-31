import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/exception-filters/global-exception.filter';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // app.enableCors({
  //   origin: [
  //     'http://localhost:5173',
  //     'http://localhost:3000',
  //     'http://iot-motionics-platform-frontend.s3-website-us-east-1.amazonaws.com',
  //     'http://iot-backend-alb-1218459569.us-east-1.elb.amazonaws.com',
  //   ],
  //   credentials: true,
  // });

  app.enableCors({
    origin: '*',
    credentials: true, // this is ignored if origin="*"
  });

  const logger: LoggerService = app.get(LoggerService);
  app.useLogger(logger);
  app.useGlobalInterceptors(
    new LoggingInterceptor(logger),
    new ResponseInterceptor(),
  );

  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const cfg = app.get(ConfigService);
  const port = cfg.get<number>('port', { infer: true }) ?? 3000;
  await app.listen(3000, '0.0.0.0');
  logger.log(`🚀  Listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
