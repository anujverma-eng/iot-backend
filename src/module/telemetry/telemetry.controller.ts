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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SensorsService } from '../sensors/sensors.service';
import { UserRole } from '../users/enums/users.enum';
import { TelemetryQuery, TelemetryQueryBody } from './dto/telemetry.dto';
import { TelemetryService } from './telemetry.service';
import { OrgContextGuard } from 'src/auth/org-context.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { PERMISSIONS } from 'src/common/constants/permissions';

@Controller('telemetry')
@UseGuards(JwtAuthGuard)
export class TelemetryController {
  constructor(
    private readonly svc: TelemetryService,
    private readonly sns: SensorsService,
  ) {}

  @Get('by-sensor/:id')
  // @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  // @RequiredPermissions(PERMISSIONS.SENSORS.HISTORICAL)
  async bySensor(@Param('id') id: string, @Query() q: TelemetryQuery) {
    const rows = await this.svc.findBySensor(id, {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: Math.min(q.limit ?? 500, 1000), // hard cap
    });
    return { data: rows };
  }

  @Post('query')
  // @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  // @RequiredPermissions(PERMISSIONS.SENSORS.HISTORICAL)
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
