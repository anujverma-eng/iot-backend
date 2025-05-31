// src/module/telemetry/telemetry.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import {
  BucketQueryDto,
  TelemetryQuery,
  TelemetryQueryBody,
} from './dto/telemetry.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';
import { Public } from '../auth/public.decorator';
import { SensorsService } from '../sensors/sensors.service';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelemetryController {
  constructor(
    private readonly svc: TelemetryService,
    private readonly sns: SensorsService,
  ) {}

  @Get('by-sensor/:id')
  async bySensor(@Param('id') id: string, @Query() q: TelemetryQuery) {
    const rows = await this.svc.findBySensor(id, {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: Math.min(q.limit ?? 500, 1000), // hard cap
    });
    return { data: rows };
  }

  // @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  @Post('query')
  // @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  @Public()
  async queryPost(@Body() body: TelemetryQueryBody) {
    const { sensorIds, timeRange, bucketSize } = body;

    const raw = await this.svc.querySeries({
      sensorIds,
      from: new Date(timeRange.start),
      to: new Date(timeRange.end),
      // bucket: bucketSize || undefined,
    });

    if (!raw || !raw.length) {
      return { status: 200, success: true, data: [], error: null };
    }

    /* grab meta (mac/type/unit) for every sensor once */
    const meta = await this.sns.getMeta(sensorIds); // tiny helper – see below

    const data = sensorIds.map((id) => {
      const rows = raw.filter((r) => r.sensorId === id);

      return {
        sensorId: id,
        mac: meta[id]?.mac ?? '',
        type: meta[id]?.type ?? 'unknown',
        unit: meta[id]?.unit ?? '',
        data: rows.map(({ ts, value }) => ({
          timestamp: ts.toISOString(),
          value,
        })),
        min: Math.min(...rows.map((r) => r.value)),
        max: Math.max(...rows.map((r) => r.value)),
        avg: rows.reduce((s, r) => s + r.value, 0) / (rows.length || 1),
        current: rows[rows.length - 1]?.value ?? null,
      };
    });

    return { status: 200, success: true, data, error: null };
  }
}
