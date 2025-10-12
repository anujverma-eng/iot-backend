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
import { 
  OptimizedTelemetryQueryDto, 
  TableDataQueryDto,
  OptimizedSensorData,
  TableSensorData,
  PaginationInfo,
  TableDataSummary
} from './dto/optimized-telemetry.dto';
import { TelemetryService } from './telemetry.service';
import { TelemetryOptimizerService } from './telemetry-optimizer.service';
import { OrgContextGuard } from 'src/auth/org-context.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { PERMISSIONS } from 'src/common/constants/permissions';
import { Public } from '../auth/public.decorator';

@Controller('telemetry')
// @UseGuards(JwtAuthGuard)
export class TelemetryController {
  constructor(
    private readonly svc: TelemetryService,
    private readonly sns: SensorsService,
    private readonly optimizer: TelemetryOptimizerService,
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

  /**
   * Optimized telemetry query endpoint for chart rendering
   * Intelligently reduces massive datasets (100k+ points) to optimal size for frontend performance
   * Uses adaptive algorithms: statistical sampling, LOD sampling, time bucketing, etc.
   * 
   * Performance targets:
   * - 1k points: <20ms
   * - 10k points: <100ms  
   * - 100k points: <500ms
   * 
   * Compression ratios:
   * - Small datasets (<1k): No compression
   * - Medium datasets (1k-10k): 60-80% compression
   * - Large datasets (10k-50k): 85-95% compression
   * - Huge datasets (50k+): 95-99% compression
   */
  @Post('query/optimized')
  @Public()
  // @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  // @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  async queryOptimized(@Body() body: OptimizedTelemetryQueryDto) {
    const startTime = Date.now();
    const { sensorIds, timeRange, targetPoints, deviceType = 'desktop', liveMode } = body;


    // Live mode override - limit to max 100 points regardless of request
    const effectiveTargetPoints = liveMode?.enabled ? 
      Math.min(liveMode.maxReadings || 100, 100) : targetPoints;
    

    // Handle live mode with simple sliding window
    if (liveMode?.enabled) {
      return this.handleLiveMode(sensorIds, timeRange, effectiveTargetPoints);
    }

    // Use optimized database-level query to avoid memory issues
    const optimizedData = await this.svc.querySeriesOptimized({
      sensorIds,
      from: new Date(timeRange.start),
      to: new Date(timeRange.end),
      targetPoints: effectiveTargetPoints,
      deviceType,
    });

    if (!optimizedData || !optimizedData.length) {
      return { 
        data: sensorIds.map(id => ({
          sensorId: id,
          mac: '',
          type: 'unknown',
          unit: '',
          data: [],
          min: 0,
          max: 0,
          avg: 0,
          current: null,
          optimization: {
            originalCount: 0,
            optimizedCount: 0,
            strategy: 'database-optimized' as const
          }
        }))
      };
    }

    // Get sensor metadata
    const meta = await this.sns.getMeta(sensorIds);

    // Get original count for statistics (efficient count query)
    const originalCountPromises = sensorIds.map(async (id) => {
      const count = await this.svc.countDocuments({
        sensorId: id,
        ts: { 
          $gte: new Date(timeRange.start), 
          $lte: new Date(timeRange.end) 
        }
      });
      return { sensorId: id, count };
    });
    const originalCounts = await Promise.all(originalCountPromises);
    const countMap = Object.fromEntries(originalCounts.map(c => [c.sensorId, c.count]));

    // Process each sensor's optimized data
    const data: OptimizedSensorData[] = sensorIds.map((id) => {
      const rows = optimizedData.filter((r) => r.sensorId === id);
      const originalCount = countMap[id] || 0;
      
      if (!rows.length) {
        return {
          sensorId: id,
          mac: meta[id]?.mac ?? '',
          type: meta[id]?.type ?? 'unknown',
          unit: meta[id]?.unit ?? '',
          data: [],
          min: 0,
          max: 0,
          avg: 0,
          current: null,
          optimization: {
            originalCount: originalCount,
            optimizedCount: 0,
            strategy: 'database-optimized' as const
          }
        };
      }

      // Calculate statistics from optimized data
      const values = rows.map(r => r.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const current = rows[rows.length - 1]?.value ?? null;

      return {
        sensorId: id,
        mac: meta[id]?.mac ?? '',
        type: meta[id]?.type ?? 'unknown',
        unit: meta[id]?.unit ?? '',
        data: rows.map(r => ({
          timestamp: r.ts.toISOString(),
          value: r.value
        })),
        min,
        max,
        avg: Math.round(avg * 100) / 100,
        current,
        optimization: {
          originalCount: originalCount,
          optimizedCount: rows.length,
          strategy: 'database-optimized' as const
        }
      };
    });

    const processingTime = Date.now() - startTime;
    data.forEach((sensor, index) => {
    });

    return { data };
  }

  /**
   * Paginated table data endpoint for displaying raw telemetry data
   * Supports pagination, sorting, and search functionality
   * Returns raw data points with full pagination metadata
   * 
   * Features:
   * - Pagination with configurable page size (max 1000)
   * - Sorting by timestamp, value, or sensor ID
   * - Search functionality across sensor IDs and values
   * - Summary statistics for the entire dataset
   */
  @Post('table-data')
  // @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @Public()
  // @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  async getTableData(@Body() body: TableDataQueryDto) {
    const startTime = Date.now();
    const { sensorIds, timeRange, pagination, sortBy = 'timestamp', sortOrder = 'descending', search } = body;


    // 🚀 PERFORMANCE FIX: Use single aggregation pipeline for everything
    const result = await this.svc.getTableDataOptimized({
      sensorIds,
      timeRange: {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      },
      pagination,
      sortBy,
      sortOrder,
      search
    });


    // Get sensor metadata (this is fast)
    const meta = await this.sns.getMeta(sensorIds);

    // Group data by sensor (in-memory, very fast)
    const sensorDataMap = new Map<string, any[]>();
    result.paginatedData.forEach(row => {
      if (!sensorDataMap.has(row.sensorId)) {
        sensorDataMap.set(row.sensorId, []);
      }
      sensorDataMap.get(row.sensorId)!.push({
        timestamp: row.ts.toISOString(),
        value: row.value
      });
    });

    // Format response data
    const data: TableSensorData[] = sensorIds.map(id => ({
      sensorId: id,
      mac: meta[id]?.mac ?? '',
      type: meta[id]?.type ?? 'unknown', 
      unit: meta[id]?.unit ?? '',
      data: sensorDataMap.get(id) || []
    }));

    const totalPages = Math.ceil(result.totalRecords / pagination.limit);
    const paginationInfo: PaginationInfo = {
      currentPage: pagination.page,
      totalPages,
      totalRecords: result.totalRecords,
      hasNext: pagination.page < totalPages,
      hasPrev: pagination.page > 1,
      limit: pagination.limit
    };

    const processingTime = Date.now() - startTime;

    return {
      data,
      pagination: paginationInfo,
      summary: result.summary
    };
  }

  /**
   * Handle live mode with simple database-level sliding window
   */
  private async handleLiveMode(
    sensorIds: string[], 
    timeRange: { start: string; end: string }, 
    maxPoints: number
  ) {
    const query = {
      sensorId: { $in: sensorIds },
      ts: { 
        $gte: new Date(timeRange.start), 
        $lte: new Date(timeRange.end) 
      }
    };

    // Get the most recent points directly from database
    const recentData = await this.svc.findWithPagination(
      query,
      { _id: 0, sensorId: 1, ts: 1, value: 1 },
      { ts: -1 }, // Sort by timestamp descending (most recent first)
      0,
      maxPoints
    );

    // Reverse to get chronological order
    const chronologicalData = recentData.reverse();

    // Get sensor metadata
    const meta = await this.sns.getMeta(sensorIds);

    // Get original counts for each sensor
    const originalCountPromises = sensorIds.map(async (id) => {
      const count = await this.svc.countDocuments({
        sensorId: id,
        ts: { 
          $gte: new Date(timeRange.start), 
          $lte: new Date(timeRange.end) 
        }
      });
      return { sensorId: id, count };
    });
    const originalCounts = await Promise.all(originalCountPromises);
    const countMap = Object.fromEntries(originalCounts.map(c => [c.sensorId, c.count]));

    // Process data by sensor
    const data: OptimizedSensorData[] = sensorIds.map((id) => {
      const rows = chronologicalData.filter((r) => r.sensorId === id);
      const originalCount = countMap[id] || 0;
      
      if (!rows.length) {
        return {
          sensorId: id,
          mac: meta[id]?.mac ?? '',
          type: meta[id]?.type ?? 'unknown',
          unit: meta[id]?.unit ?? '',
          data: [],
          min: 0,
          max: 0,
          avg: 0,
          current: null,
          optimization: {
            originalCount: originalCount,
            optimizedCount: 0,
            strategy: 'sliding-window' as const
          }
        };
      }

      // Calculate statistics
      const values = rows.map(r => r.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const current = rows[rows.length - 1]?.value ?? null;

      return {
        sensorId: id,
        mac: meta[id]?.mac ?? '',
        type: meta[id]?.type ?? 'unknown',
        unit: meta[id]?.unit ?? '',
        data: rows.map(r => ({
          timestamp: r.ts.toISOString(),
          value: r.value
        })),
        min,
        max,
        avg: Math.round(avg * 100) / 100,
        current,
        optimization: {
          originalCount: originalCount,
          optimizedCount: rows.length,
          strategy: 'sliding-window' as const
        }
      };
    });

    return { data };
  }
}
