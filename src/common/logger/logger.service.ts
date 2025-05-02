/**
 * Thin wrapper so we can add helper methods (e.g., logJSON)
 * while still conforming to Nest's LoggerService interface.
 */
import {
  Injectable,
  LoggerService as NestLogger,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

@Injectable()
export class LoggerService implements NestLogger {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }
  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { context, trace });
  }
  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }
  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }
  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  /** Helper: log any object as prettified JSON at debug level */
  logJSON(obj: unknown, context?: string) {
    this.logger.debug(JSON.stringify(obj, null, 2), { context });
  }
}
