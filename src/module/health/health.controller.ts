import { Controller, Get } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';

@Controller('health')
export class HealthController {
  constructor(private readonly logger: LoggerService) {}

  @Get()
  getHealth(): { status: string } {
    this.logger.debug('Health check ping', HealthController.name);
    return { status: 'ok' };
  }
}
