import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { Error as MongooseError } from 'mongoose';
import { LoggerService } from '../logger/logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    // 1️⃣ normal Nest HttpException
    if (exception instanceof HttpException) {
      const status  = exception.getStatus();
      const payload = exception.getResponse();

      this.logger.error(
        JSON.stringify(payload),
        exception.stack,
        GlobalExceptionFilter.name,
      );

      return response.status(status).json({
        success    : false,
        statusCode : status,
        message    : payload,
        timestamp  : new Date().toISOString(),
        path       : request.url,
        from       : 'iot‑backend | GlobalExceptionFilter',
      });
    }

    if ((exception as any).name === 'ValidationError') {
      const err = exception as MongooseError.ValidationError;
      const messages = Object.values(err.errors).map(e => e.message);
    
      this.logger.error(
        messages.join('; '),
        undefined,
        GlobalExceptionFilter.name,
      );
    
      return response.status(HttpStatus.BAD_REQUEST).json({
        success    : false,
        statusCode : HttpStatus.BAD_REQUEST,
        message    : messages,
        timestamp  : new Date().toISOString(),
        path       : request.url,
        from       : 'iot‑backend | GlobalExceptionFilter',
      });
    }

    // 2️⃣ unhandled error / unknown throw
    this.logger.error(
      String(exception),
      undefined,
      GlobalExceptionFilter.name,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success    : false,
      statusCode : HttpStatus.INTERNAL_SERVER_ERROR,
      message    : `Internal Server Error`,
      timestamp  : new Date().toISOString(),
      path       : request.url,
      from       : 'iot‑backend | GlobalExceptionFilter',
    });
  }
}
