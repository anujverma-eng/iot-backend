// src/interceptors/response.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface HandlerEnvelope<T> {
  data?: T;
  message?: string;
  pagination?: PaginationMeta;
}

// run‑time check
function isEnvelope<T>(obj: unknown): obj is HandlerEnvelope<T> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    ('data' in obj || 'message' in obj || 'pagination' in obj)
  );
}

interface ApiResponse<T> {
  status: number;
  success: boolean;
  message: string;
  data: T | null;
  from: string;
  error: unknown | null;
  pagination?: PaginationMeta;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T | HandlerEnvelope<T>, ApiResponse<T>>
{
  private readonly SERVICE = 'iot‑backend';

  intercept(
    context: ExecutionContext,
    next: CallHandler<T | HandlerEnvelope<T>>,
  ): Observable<ApiResponse<T>> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((body) => {
        const status    = res.statusCode;
        const success   = status < 400;
        let   data: T | null;
        let   message: string | undefined;
        let   pagination: PaginationMeta | undefined;

        if (isEnvelope<T>(body)) {
          // handler returned our envelope
          data       = success ? (body.data as T | undefined ?? null) : null;
          message    = body.message;
          pagination = body.pagination;
        } else {
          // handler returned plain data
          data = success ? (body as T) : null;
        }

        const resp: ApiResponse<T> = {
          status,
          success,
          message:
            message ??
            (success ? 'Operation successful' : 'Operation failed'),
          data,
          from  : this.SERVICE,
          error : success ? null : body,
          ...(pagination && { pagination }),
        };

        return resp;
      }),
    );
  }
}
