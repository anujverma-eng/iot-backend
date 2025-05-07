// src/module/telemetry/telemetry.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { BucketQueryDto, TelemetryQuery } from './dto/telemetry.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelemetryController {
  constructor(private readonly svc: TelemetryService) {}

  @Get('by-sensor/:id')
  async bySensor(@Param('id') id: string, @Query() q: TelemetryQuery) {
    const rows = await this.svc.findBySensor(id, {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: Math.min(q.limit ?? 500, 1000), // hard cap
    });
    return { data: rows };
  }

  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  @Get('query')
  async query(@Query() q: BucketQueryDto) {
    const rows = await this.svc.aggregate({
      sensorIds: q.sensorIds ?? [],
      from: new Date(q.from),
      to: new Date(q.to),
      bucket: q.bucket,
    });
    return { data: rows };
  }
}
