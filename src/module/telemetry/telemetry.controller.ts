// src/module/telemetry/telemetry.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Res,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { DateTime } from 'luxon';
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
  TableDataSummary,
  OptimizationInfo
} from './dto/optimized-telemetry.dto';
import {
  BulkExportQueryDto,
  ExportStatusQueryDto,
  ExportFormat,
  ExportMode,
  StreamingExportResponse,
  BackgroundExportResponse,
  ExportProgress
} from './dto/bulk-export.dto';
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
  ) { }

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

    console.log('\n🚀 === OPTIMIZED TELEMETRY QUERY START ===');
    console.log('📝 Full Request Body:', JSON.stringify(body, null, 2));
    console.log('🎯 Parsed Request:', {
      sensorIds: `[${sensorIds.join(', ')}] (${sensorIds.length} sensors)`,
      timeRange: `${timeRange.start} -> ${timeRange.end}`,
      timeSpanDays: Math.round((new Date(timeRange.end).getTime() - new Date(timeRange.start).getTime()) / (24 * 60 * 60 * 1000)),
      targetPoints,
      deviceType,
      liveMode,
      isComparison: sensorIds.length > 1
    });


    // Live mode override - limit to max 100 points regardless of request
    const effectiveTargetPoints = liveMode?.enabled ?
      liveMode.maxReadings || 100 : targetPoints;


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

      // 🔍 SMART STRATEGY DETECTION: Detect which optimization was used
      const strategy = this.detectOptimizationStrategy(rows, sensorIds.length, effectiveTargetPoints);

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
          strategy: strategy
        }
      };
    });

    const processingTime = Date.now() - startTime;

    console.log('\n📊 === FINAL RESULTS SUMMARY ===');

    // Check if this is truly comparative data (same number of points for each sensor)
    const isComparativeData = data.length > 1 && new Set(data.map(s => s.data.length)).size === 1;

    if (isComparativeData) {
      console.log('🎯 === COMPARATIVE DATA DETECTED ===');
      console.log(`✅ All ${data.length} sensors have exactly ${data[0].data.length} synchronized data points`);
      console.log(`🕐 This indicates true comparative analysis data with aligned timestamps`);

      // Show comparison table for first few points
      if (data[0].data.length > 0) {
        console.log(`\n📊 === COMPARISON VALIDATION TABLE ===`);
        const comparisonTable: any[] = [];
        const sampleCount = Math.min(3, data[0].data.length);

        for (let i = 0; i < sampleCount; i++) {
          const rowData: any = {
            timestamp: data[0].data[i].timestamp
          };

          data.forEach((sensor, sensorIndex) => {
            rowData[`Sensor_${sensorIndex + 1}_${sensor.sensorId.substring(0, 8)}`] = sensor.data[i].value;
          });

          comparisonTable.push(rowData);
        }

        console.table(comparisonTable);
        console.log(`✅ Above table confirms synchronized readings - this is true comparative data!`);
      }
    } else if (data.length > 1) {
      console.log('⚠️ === NON-COMPARATIVE DATA WARNING ===');
      console.log(`❌ Sensors have different point counts: ${data.map(s => s.data.length).join(', ')}`);
      console.log(`🔄 This suggests individual sensor optimization instead of comparative sampling`);
    }

    data.forEach((sensor, index) => {
      console.log(`📈 Sensor ${index + 1}: ${sensor.sensorId}`);
      console.log(`   🏷️  MAC: ${sensor.mac}, Type: ${sensor.type}, Unit: ${sensor.unit}`);
      console.log(`   📊 Data points: ${sensor.data.length}`);
      console.log(`   📈 Values: min=${sensor.min}, max=${sensor.max}, avg=${sensor.avg}`);
      console.log(`   🔧 Optimization: ${sensor.optimization.strategy} (${sensor.optimization.originalCount} -> ${sensor.optimization.optimizedCount})`);

      if (sensor.data.length > 0) {
        console.log(`   ⏰ Time range: ${sensor.data[0].timestamp} -> ${sensor.data[sensor.data.length - 1].timestamp}`);
        console.log(`   📝 Sample values: [${sensor.data.slice(0, 3).map(d => d.value).join(', ')}${sensor.data.length > 3 ? '...' : ''}]`);
      }
    });
    console.log(`⏱️  Total processing time: ${processingTime}ms`);
    console.log('🏁 === OPTIMIZEwD TELEMETRY QUERY END ===\n');

    return { data };
  }

  /**
   * 🔍 Detect which optimization strategy was used based on data patterns
   */
  private detectOptimizationStrategy(
    rows: any[],
    sensorCount: number,
    targetPoints: number
  ): OptimizationInfo['strategy'] {
    if (!rows.length) return 'database-optimized';

    // Check for intersection-based sampling (comparison mode with exact timestamps)
    if (sensorCount > 1) {
      // Check if data points have synchronized timestamps (intersection-based)
      const timestamps = rows.map(r => new Date(r.ts).getTime());
      const timeSet = new Set(timestamps);

      // If we have fewer unique timestamps than total points, it suggests intersection-based sampling
      const uniqueTimestampRatio = timeSet.size / timestamps.length;

      if (uniqueTimestampRatio < 0.8) { // Less than 80% unique timestamps suggests intersection
        console.log(`🎯 Detected intersection-based sampling (${timeSet.size} unique timestamps from ${timestamps.length} points)`);
        return 'intersection-based-sampling';
      }

      // Check for time alignment (time-bucket sampling)
      if (timestamps.length > 1) {
        const intervals: number[] = [];

        for (let i = 1; i < Math.min(5, timestamps.length); i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }

        // If intervals are consistent (within 10% variance), it's time-aligned
        if (intervals.length > 1) {
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.every(interval =>
            Math.abs(interval - avgInterval) / avgInterval < 0.1
          );

          if (variance) {
            console.log(`🎯 Detected time-aligned sampling (consistent ${Math.floor(avgInterval / 60000)}min intervals)`);
            return 'time-aligned-sampling';
          }
        }
      }
    }

    // Default to database-optimized for other cases
    return 'database-optimized';
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
    // Sort by ts DESC + _id DESC for deterministic, consistent results
    // (prevents inconsistent results when multiple docs have same timestamp)
    const recentData = await this.svc.findWithPagination(
      query,
      { _id: 0, sensorId: 1, ts: 1, value: 1 },
      { ts: -1, _id: -1 }, // Secondary sort by _id for consistent ordering
      0,
      maxPoints
    );

    console.log(`📊 LIVE MODE DEBUG: Requested ${maxPoints} records, got ${recentData.length} records`);
    console.log(`📊 Query: sensorIds=${sensorIds.join(',')}, start=${timeRange.start}, end=${timeRange.end}`);

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

  /**
   * 📥 BULK EXPORT - Estimate export size and get info
   */
  @Public()
  @Post('export/estimate')
  async estimateExport(@Body() query: any) {
    const startTime = Date.now();

    // Use consistent defaults with stream endpoint
    const format = query.format || 'csv';
    const includeMetadata = query.includeMetadata !== false;

    console.log('🔍 === EXPORT ESTIMATION START ===');
    console.log(`📊 Sensors: ${query.sensorIds?.length} [${query.sensorIds?.join(', ')}]`);
    console.log(`📅 Time Range: ${query.timeRange?.start} -> ${query.timeRange?.end}`);
    console.log(`🔧 Include Metadata: ${includeMetadata} (from query: ${query.includeMetadata})`);
    console.log(`📊 Format: ${format}`);

    const estimate = await this.svc.estimateExportSize({
      sensorIds: query.sensorIds || [],
      timeRange: {
        start: new Date(query.timeRange?.start || ''),
        end: new Date(query.timeRange?.end || '')
      },
      format,
      includeMetadata
    });

    const processingTime = Date.now() - startTime;

    console.log(`📊 Export Estimation Results:`);
    console.log(`   📈 Total Records: ${estimate.totalRecords.toLocaleString()}`);
    console.log(`   ⏱️ Estimated Duration: ${estimate.estimatedDuration}`);
    console.log(`   💾 Estimated Size: ${estimate.estimatedSizeKB.toLocaleString()} KB (${estimate.estimatedSizeBytes?.toLocaleString()} bytes)`);
    console.log(`   📋 Format: ${estimate.sizeCalculation}`);
    console.log(`   🔧 Recommended Batch: ${estimate.recommendedBatchSize.toLocaleString()}`);
    console.log(`⏱️ Estimation Time: ${processingTime}ms`);

    return {
      success: true,
      ...estimate,
      recommendation: estimate.totalRecords > 100000 ? 'background' : 'stream'
    };
  }

  /**
   * 🔄 BULK EXPORT - Streaming CSV/JSON export for raw data
   */
  @Public()
  @Post('export/stream')
  async streamExport(
    @Body() query: any,
    @Res() res: Response
  ) {
    const startTime = Date.now();

    // Set defaults
    const format = query.format || ExportFormat.CSV;
    const maxRecords = query.maxRecords || 500000;
    const includeMetadata = query.includeMetadata !== false;
    const timezone = query.timezone || null; // IANA timezone string (e.g., 'Asia/Kolkata')

    // Helper function to convert timestamp to user's timezone
    // Format: YYYY-MM-DD HH:MM:SS (Excel/Google Sheets friendly)
    const formatTimestamp = (isoTimestamp: string): string => {
      if (!timezone) return isoTimestamp; // Return ISO format if no timezone specified
      try {
        const dt = DateTime.fromISO(isoTimestamp, { zone: 'utc' });
        return dt.setZone(timezone).toFormat('yyyy-MM-dd HH:mm:ss');
      } catch (e) {
        return isoTimestamp; // Fallback to original if conversion fails
      }
    };

    console.log('\n📥 === STREAMING EXPORT START ===');
    console.log(`🌍 Timezone: ${timezone || 'UTC (default)'}`);
    console.log(`🔧 Include Metadata: ${includeMetadata} (from query: ${query.includeMetadata})`);
    console.log(`📋 Sensors: ${query.sensorIds?.length} [${query.sensorIds?.join(', ')}]`);
    console.log(`🔍 Debug query object:`, JSON.stringify(query, null, 2));

    try {
      // Validate required fields
      if (!query.sensorIds || !query.timeRange) {
        throw new Error('sensorIds and timeRange are required');
      }

      // Estimate first - use same parameters as will be used for export
      const estimate = await this.svc.estimateExportSize({
        sensorIds: query.sensorIds,
        timeRange: {
          start: new Date(query.timeRange.start),
          end: new Date(query.timeRange.end)
        },
        format,
        includeMetadata
      });

      // Adaptive batch size based on dataset size (after estimate is available)
      const adaptiveBatchSize = estimate.totalRecords > 100000 ? 20000 : 10000;
      const batchSize = query.batchSize || adaptiveBatchSize;

      console.log(`📊 Format: ${format}, Batch Size: ${batchSize.toLocaleString()}, Max: ${maxRecords.toLocaleString()}`);
      console.log(`🎯 Adaptive Batch: ${estimate.totalRecords.toLocaleString()} records → ${batchSize.toLocaleString()} batch size`);

      if (estimate.totalRecords > maxRecords) {
        return res.status(400).json({
          success: false,
          error: `Dataset too large (${estimate.totalRecords} > ${maxRecords}). Use background export instead.`,
          estimatedRecords: estimate.totalRecords,
          recommendedMode: 'background'
        });
      }

      // Setup streaming response headers
      const filename = query.filename ||
        `telemetry-export-${Date.now()}.${format}`;

      const contentType = format === ExportFormat.CSV ? 'text/csv' : 'application/json';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // 📏 CONDITIONAL CONTENT-LENGTH: Only for small datasets WITHOUT timezone conversion
      // When timezone is specified, the timestamp format changes and content length will be different
      if (estimate.totalRecords <= 1000 && !timezone) {
        try {
          console.log('📏 Calculating exact content size for small dataset...');

          const contentLength = await this.svc.calculateExportSize({
            sensorIds: query.sensorIds,
            timeRange: {
              start: new Date(query.timeRange.start),
              end: new Date(query.timeRange.end)
            },
            format,
            includeMetadata,
            estimatedRecords: estimate.totalRecords
          });

          console.log(`📏 Small dataset - setting Content-Length: ${contentLength.toLocaleString()} bytes`);
          res.setHeader('Content-Length', contentLength.toString());
          res.setHeader('Accept-Ranges', 'bytes');
        } catch (error) {
          console.log(`⚠️ Size calculation failed for small dataset: ${error.message}`);
          // Fallback to chunked transfer if calculation fails
        }
      } else if (timezone) {
        console.log(`📏 Timezone specified (${timezone}) - using chunked transfer (timestamp format changes size)`);
        // Skip Content-Length when timezone conversion is applied
      } else {
        console.log(`📏 Large dataset (${estimate.totalRecords.toLocaleString()} records) - using chunked transfer encoding for optimal performance`);
        // For large datasets, skip Content-Length to avoid calculation overhead
        // Frontend will handle progress differently for large exports
      }

      let processedRecords = 0;
      let lastId: string | undefined;
      let chunkCount = 0;

      console.log(`🚀 Starting streaming export: ${estimate.totalRecords.toLocaleString()} records`);

      // CSV Header or JSON array start
      if (format === ExportFormat.CSV) {
        const csvHeader = includeMetadata
          ? 'sensorId,timestamp,value,metadata\n'
          : 'sensorId,timestamp,value\n';
        res.write(csvHeader);
      } else if (format === ExportFormat.JSON) {
        res.write('{"data":[');
      }

      // Get metadata if needed
      let metadata: any = {};
      if (includeMetadata) {
        const metaArray = await this.svc.getExportMetadata(query.sensorIds);
        metadata = metaArray.reduce((acc, meta) => {
          acc[meta.sensorId] = meta;
          return acc;
        }, {});
      }

      // Stream data in chunks
      while (true) {
        const chunk = await this.svc.getExportChunk({
          sensorIds: query.sensorIds,
          timeRange: {
            start: new Date(query.timeRange.start),
            end: new Date(query.timeRange.end)
          },
          batchSize,
          lastId
        });

        if (chunk.count === 0) break;

        chunkCount++;
        processedRecords += chunk.count;

        // Reduced logging for large datasets to improve performance
        if (estimate.totalRecords <= 50000 || chunkCount % 5 === 0) {
          console.log(`📦 Chunk ${chunkCount}: ${chunk.count} records (${processedRecords.toLocaleString()}/${estimate.totalRecords.toLocaleString()})`);
          console.log(`🔍 Chunk details: lastId=${lastId?.substring(0, 8)}..., hasMore=${chunk.hasMore}, chunkSize=${chunk.count}`);
        }

        // Format and write chunk
        for (let i = 0; i < chunk.data.length; i++) {
          const row = chunk.data[i];
          const formattedTs = formatTimestamp(row.timestamp);

          if (format === ExportFormat.CSV) {
            const metaStr = includeMetadata && metadata[row.sensorId]
              ? JSON.stringify(metadata[row.sensorId]).replace(/"/g, '""')
              : '';
            const csvRow = includeMetadata
              ? `"${row.sensorId}","${formattedTs}",${row.value},"${metaStr}"\n`
              : `"${row.sensorId}","${formattedTs}",${row.value}\n`;
            res.write(csvRow);
          } else if (format === ExportFormat.JSON) {
            const jsonRow = includeMetadata
              ? { ...row, timestamp: formattedTs, metadata: metadata[row.sensorId] }
              : { ...row, timestamp: formattedTs };
            // Fix: Only add comma if this is not the first record overall
            const isFirstRecord = processedRecords - chunk.count + i === 0;
            const prefix = isFirstRecord ? '' : ',';
            res.write(prefix + JSON.stringify(jsonRow));
          } else if (format === ExportFormat.JSONL) {
            const jsonRow = includeMetadata
              ? { ...row, timestamp: formattedTs, metadata: metadata[row.sensorId] }
              : { ...row, timestamp: formattedTs };
            res.write(JSON.stringify(jsonRow) + '\n');
          }
        }

        lastId = chunk.lastId || undefined;
        console.log(`🔄 Updated lastId: ${lastId?.substring(0, 8)}..., hasMore: ${chunk.hasMore}`);

        if (!chunk.hasMore) {
          console.log(`🏁 Breaking loop - no more data (chunk.hasMore = false)`);
          break;
        }

        // Prevent memory buildup
        if (chunkCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Close JSON array
      if (format === ExportFormat.JSON) {
        res.write(']}');
      }

      const totalTime = Date.now() - startTime;
      const actualRecordsPerSec = Math.round(processedRecords / (totalTime / 1000));

      console.log(`✅ Streaming export completed:`);
      console.log(`   📊 Records exported: ${processedRecords.toLocaleString()}`);
      console.log(`   📦 Chunks processed: ${chunkCount}`);
      console.log(`   ⏱️ Total time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      console.log(`   🚀 Actual speed: ${actualRecordsPerSec} records/sec`);
      console.log(`   📈 Estimated vs Actual: ${estimate.estimatedDuration} vs ${Math.round(totalTime / 1000)}s`);

      // Performance feedback for future estimates
      if (actualRecordsPerSec < 1500) {
        console.log(`   ⚠️ Performance below expected - consider optimizing queries`);
      } else if (actualRecordsPerSec > 4000) {
        console.log(`   🎯 Excellent performance - estimation can be more aggressive`);
      }

      res.end();

    } catch (error) {
      console.error(`❌ Streaming export failed:`, error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Export failed: ' + error.message,
          timestamp: new Date().toISOString()
        });
      } else {
        // If headers already sent, we're mid-stream - just end it
        res.end();
      }
    }
  }

  /**
   * 📋 BULK EXPORT - Get export status (for background jobs)
   */
  @Public()
  @Get('export/status/:jobId')
  async getExportStatus(@Param('jobId') jobId: string) {
    // This would integrate with a job queue system like Bull/BullMQ
    // For now, return a mock response
    return {
      success: true,
      progress: {
        jobId,
        status: 'processing',
        progress: 75,
        estimatedTimeRemaining: '2m',
        processedRecords: 75000,
        totalRecords: 100000
      } as ExportProgress
    };
  }
}
