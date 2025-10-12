// src/module/telemetry/telemetry.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Telemetry, TelemetryDocument } from './telemetry.schema';
import { Model, PipelineStage } from 'mongoose';
import { Bucket } from './enum/telemetry.enum';
// import ms from 'ms';
import * as ms from 'ms';     
import type { StringValue } from 'ms';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telModel: Model<TelemetryDocument>,
  ) {}

  async findBySensor(
    sensorId: string,
    opts: { from?: Date; to?: Date; limit: number },
  ) {
    const q: any = { sensorId };
    if (opts.from || opts.to) q.ts = {};
    if (opts.from) q.ts.$gte = opts.from;
    if (opts.to) q.ts.$lte = opts.to;

    return this.telModel
      .find(q, { _id: 0, __v: 0, sensorId: 0 })
      .sort({ ts: -1 })
      .limit(opts.limit)
      .lean();
  }

  private toTrunc(b: Bucket) {
    switch (b) {
      case Bucket.MIN1:
        return { unit: 'minute', binSize: 1 };
      case Bucket.MIN5:
        return { unit: 'minute', binSize: 5 };
      case Bucket.HOUR:
        return { unit: 'hour', binSize: 1 };
      case Bucket.DAY:
        return { unit: 'day', binSize: 1 };
      default:
        return null; // RAW
    }
  }

  async querySeries(opts: {
    sensorIds: string[];
    from: Date;
    to: Date;
    bucket?: StringValue;
  }) {
    const match = {
      sensorId: { $in: opts.sensorIds },
      ts: { $gte: opts.from, $lte: opts.to },
    };

    /* raw – no bucketSize => just sorted data */
    if (!opts.bucket) {
      return this.telModel
        .find(match, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: 1 })
        .lean();
    }

    /* convert "15m", "1h" … to minutes / hours / days  */
    if (opts.bucket) {
      const msSize = ms(opts.bucket);
      if (!msSize) throw new BadRequestException('Invalid bucketSize');
      // e.g. 900000
      const unit =
        msSize % 3600000 === 0
          ? 'hour'
          : msSize % 60000 === 0
            ? 'minute'
            : 'second';
      const bin = Math.round(
        msSize / { second: 1_000, minute: 60_000, hour: 3_600_000 }[unit],
      );

      const pipe: PipelineStage[] = [
        { $match: match },
        {
          $set: {
            bucket: {
              $dateTrunc: { date: '$ts', unit, binSize: bin, timezone: 'UTC' },
            },
          },
        },
        {
          $group: {
            _id: { sensor: '$sensorId', bucket: '$bucket' },
            value: { $avg: '$value' }, // centre line
          },
        },
        { $sort: { '_id.bucket': 1 } },
        {
          $project: {
            _id: 0,
            sensorId: '$_id.sensor',
            ts: '$_id.bucket',
            value: 1,
          },
        },
      ];

      return this.telModel.aggregate(pipe).exec();
    }
  }

  /**
   * Optimized query for large datasets - uses database-level sampling to avoid memory issues
   * This replaces the memory-intensive approach of fetching all data first
   */
  async querySeriesOptimized(opts: {
    sensorIds: string[];
    from: Date;
    to: Date;
    targetPoints: number;
    deviceType?: 'mobile' | 'desktop';
  }) {
    const match = {
      sensorId: { $in: opts.sensorIds },
      ts: { $gte: opts.from, $lte: opts.to },
    };

    // First, get data count to decide strategy
    const totalCount = await this.telModel.countDocuments(match);

    if (totalCount === 0) {
      return [];
    }

    // If dataset is small enough, return raw data
    if (totalCount <= 1000) {
      return this.telModel
        .find(match, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: 1 })
        .lean();
    }

    // For large datasets, use database-level optimization
    const result = await this.performDatabaseLevelOptimization(match, totalCount, opts.targetPoints, opts.deviceType);
    
    // 🚨 FINAL CHECK: Only fallback if we got dramatically fewer points AND there's enough data
    if (result.length < opts.targetPoints * 0.6 && totalCount >= opts.targetPoints * 2) {
      
      try {
        const emergencyResult = await this.statisticalSamplingPipeline(match, opts.targetPoints);
        
        if (emergencyResult.length > result.length * 1.3) { // At least 30% better
          return emergencyResult;
        }
      } catch (error) {

      }
    }
    
    return result;
  }

  /**
   * Uses MongoDB aggregation pipeline to perform sampling at database level
   * Avoids memory issues by never loading full dataset into memory
   */
  private async performDatabaseLevelOptimization(
    match: any,
    totalCount: number,
    targetPoints: number,
    deviceType: 'mobile' | 'desktop' = 'desktop'
  ) {

    // 🎯 CRITICAL FIX: NEVER adjust target points - frontend decides, backend respects
    
    // Calculate sampling ratio
    const samplingRatio = Math.min(1, targetPoints / totalCount);
    
    // 🚀 NEW PRIORITY LOGIC: Always try statistical sampling first to respect target points
    
    try {
      const statisticalResult = await this.statisticalSamplingPipeline(match, targetPoints);
      
      // If statistical sampling gets us close enough, use it
      if (statisticalResult.length >= targetPoints * 0.8) { // At least 80% of target
        return statisticalResult;
      } else {
        // Fall back to time bucketing only if statistical sampling failed
        return this.timeBucketSamplingPipeline(match, targetPoints);
      }
    } catch (error) {
      return this.timeBucketSamplingPipeline(match, targetPoints);
    }
  }

  /**
   * Statistical sampling using MongoDB's $sample operator - PRIORITIZES EXACT TARGET POINTS
   */
  private async statisticalSamplingPipeline(match: any, targetPoints: number) {
    // 🎯 AGGRESSIVE SAMPLING: Try to get as close as possible to exact target
    const sampleSize = Math.min(targetPoints * 1.1, 1000000); // Allow up to 1M for sampling, small buffer
    
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sample: { size: sampleSize } }, // Sample with small buffer
      { $sort: { ts: 1 } }, // Sort by timestamp
      { $limit: targetPoints }, // Limit to EXACT target
      {
        $project: {
          _id: 0,
          sensorId: 1,
          ts: 1,
          value: 1,
        },
      },
    ];

    
    const result = await this.telModel.aggregate(pipeline).exec();
    
    return result;
  }

  /**
   * Time-based bucketing for heavy data reduction at database level
   */
  private async timeBucketSamplingPipeline(match: any, targetPoints: number) {
    
    // Get time range to calculate optimal bucket size
    const timeRangeResult = await this.telModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          minTime: { $min: '$ts' },
          maxTime: { $max: '$ts' },
        },
      },
    ]).exec();

    if (!timeRangeResult.length) {
      return [];
    }

    const { minTime, maxTime } = timeRangeResult[0];
    const timeSpanMs = maxTime.getTime() - minTime.getTime();
    const timeSpanDays = timeSpanMs / (24 * 60 * 60 * 1000);
    
    
    // Calculate bucket size to get approximately targetPoints buckets
    const bucketSizeMs = Math.max(timeSpanMs / targetPoints, 60 * 1000); // Minimum 1 minute
    
    // Convert to MongoDB time units
    let unit: string;
    let binSize: number;
    
    if (bucketSizeMs < 60 * 1000) { // Less than 1 minute
      unit = 'second';
      binSize = Math.max(1, Math.round(bucketSizeMs / 1000));
    } else if (bucketSizeMs < 60 * 60 * 1000) { // Less than 1 hour
      unit = 'minute';
      binSize = Math.max(1, Math.round(bucketSizeMs / (60 * 1000)));
    } else if (bucketSizeMs < 24 * 60 * 60 * 1000) { // Less than 1 day
      unit = 'hour';
      binSize = Math.max(1, Math.round(bucketSizeMs / (60 * 60 * 1000)));
    } else { // 1 day or more
      unit = 'day';
      binSize = Math.max(1, Math.round(bucketSizeMs / (24 * 60 * 60 * 1000)));
    }


    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $addFields: {
          bucket: {
            $dateTrunc: { 
              date: '$ts', 
              unit: unit as any, 
              binSize: binSize, 
              timezone: 'UTC' 
            },
          },
        },
      },
      {
        $group: {
          _id: { sensor: '$sensorId', bucket: '$bucket' },
          // Keep multiple representative points per bucket
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          firstPoint: { $first: { ts: '$ts', value: '$value' } },
          lastPoint: { $last: { ts: '$ts', value: '$value' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.bucket': 1 } },
      {
        $project: {
          _id: 0,
          sensorId: '$_id.sensor',
          bucketTime: '$_id.bucket',
          avgValue: 1,
          minValue: 1,
          maxValue: 1,
          firstPoint: 1,
          lastPoint: 1,
          count: 1,
        },
      },
      { $limit: targetPoints * 2 }, // Allow some extra for processing
    ];

    const bucketResults = await this.telModel.aggregate(pipeline).exec();
    
    // Convert bucket results to point format, preserving important values
    const points: any[] = [];
    
    bucketResults.forEach((bucket, index) => {
      
      // Always add the average point for trend
      points.push({
        sensorId: bucket.sensorId,
        ts: bucket.bucketTime,
        value: bucket.avgValue,
      });
      
      // Add min/max if they're significantly different and we have room
      if (points.length < targetPoints && Math.abs(bucket.maxValue - bucket.avgValue) > Math.abs(bucket.maxValue - bucket.minValue) * 0.1) {
        points.push({
          sensorId: bucket.sensorId,
          ts: bucket.firstPoint.ts,
          value: bucket.maxValue,
        });
      }
      
      if (points.length < targetPoints && Math.abs(bucket.minValue - bucket.avgValue) > Math.abs(bucket.maxValue - bucket.minValue) * 0.1) {
        points.push({
          sensorId: bucket.sensorId,
          ts: bucket.lastPoint.ts,
          value: bucket.minValue,
        });
      }
    });

    
    // Sort by timestamp and limit to target
    const finalPoints = points
      .sort((a, b) => a.ts.getTime() - b.ts.getTime())
      .slice(0, targetPoints);
    
    
    // 🎯 ENSURE WE HIT TARGET: If we're significantly under target, add more points per bucket
    if (finalPoints.length < targetPoints * 0.8) { // Less than 80% of target
      
      // Calculate how many more points we need
      const pointsNeeded = targetPoints - finalPoints.length;
      const pointsPerBucket = Math.ceil(pointsNeeded / bucketResults.length);
      
      
      // Add more representative points from each bucket
      bucketResults.forEach((bucket) => {
        let addedForThisBucket = 0;
        
        // Add first point if we haven't and need more points
        if (finalPoints.length < targetPoints && bucket.firstPoint && addedForThisBucket < pointsPerBucket) {
          finalPoints.push({
            sensorId: bucket.sensorId,
            ts: bucket.firstPoint.ts,
            value: bucket.firstPoint.value,
          });
          addedForThisBucket++;
        }
        
        // Add last point if different from first and we need more points
        if (finalPoints.length < targetPoints && bucket.lastPoint && addedForThisBucket < pointsPerBucket) {
          const lastTs = bucket.lastPoint.ts.getTime();
          const firstTs = bucket.firstPoint?.ts.getTime();
          
          if (Math.abs(lastTs - firstTs) > 60000) { // At least 1 minute apart
            finalPoints.push({
              sensorId: bucket.sensorId,
              ts: bucket.lastPoint.ts,
              value: bucket.lastPoint.value,
            });
            addedForThisBucket++;
          }
        }
      });
      
      // Sort again and limit to exact target
      const enhancedResult = finalPoints
        .sort((a, b) => a.ts.getTime() - b.ts.getTime())
        .slice(0, targetPoints);
      
      return enhancedResult;
    }
    
    return finalPoints;
  }

  /** Core bucketed query used by controller & future jobs */
  async aggregate(opts: {
    sensorIds: string[];
    from: Date;
    to: Date;
    bucket: Bucket;
  }) {
    const match: any = {
      sensorId: { $in: opts.sensorIds },
      ts: { $gte: opts.from, $lte: opts.to },
    };

    const trunc = this.toTrunc(opts.bucket);
    if (!trunc) {
      return this.telModel
        .find(match, { _id: 0, __v: 0 })
        .sort({ ts: 1 })
        .limit(10_000)
        .lean();
    }

    const pipe: PipelineStage[] = [
      { $match: match },
      {
        $set: {
          bucket: {
            $dateTrunc: {
              date: '$ts',
              unit: trunc.unit,
              binSize: trunc.binSize,
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $group: {
          _id: { sensor: '$sensorId', bucket: '$bucket' },
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
        },
      },
      { $sort: { '_id.bucket': 1 } },
      {
        $project: {
          _id: 0,
          sensorId: '$_id.sensor',
          ts: '$_id.bucket',
          avg: 1,
          min: 1,
          max: 1,
        },
      },
    ];

    return this.telModel.aggregate(pipe).exec();
  }

  /**
   * Count documents matching the query
   */
  async countDocuments(query: any): Promise<number> {
    return this.telModel.countDocuments(query);
  }

  /**
   * Find documents with pagination and sorting
   */
  async findWithPagination(
    query: any,
    projection: any,
    sortObj: any,
    skip: number,
    limit: number
  ) {
    return this.telModel
      .find(query, projection)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Find documents for summary calculations
   */
  async findForSummary(query: any, projection: any = { value: 1, _id: 0 }) {
    return this.telModel.find(query, projection).lean();
  }

  /**
   * ⚡ OPTIMIZED TABLE DATA - Single aggregation pipeline for everything!
   * Replaces 3 separate DB calls with 1 efficient pipeline
   * - Gets total count, paginated data, AND summary stats in one go
   */
  async getTableDataOptimized(params: {
    sensorIds: string[];
    timeRange: { start: Date; end: Date };
    pagination: { page: number; limit: number };
    sortBy: string;
    sortOrder: 'ascending' | 'descending';
    search?: string;
  }) {
    const { sensorIds, timeRange, pagination, sortBy, sortOrder, search } = params;
    
    // Build base match stage
    const matchStage: any = {
      sensorId: { $in: sensorIds },
      ts: { 
        $gte: timeRange.start, 
        $lte: timeRange.end 
      }
    };

    // Add search filter if provided
    if (search && search.trim()) {
      const numericSearch = parseFloat(search);
      const searchConditions: any[] = [
        { sensorId: { $regex: search, $options: 'i' } }
      ];
      
      if (!isNaN(numericSearch)) {
        searchConditions.push({ value: numericSearch });
      }
      
      matchStage.$or = searchConditions;
    }

    // Build sort stage
    const sortStage: any = {};
    if (sortBy === 'timestamp') {
      sortStage.ts = sortOrder === 'ascending' ? 1 : -1;
    } else if (sortBy === 'value') {
      sortStage.value = sortOrder === 'ascending' ? 1 : -1;
    } else if (sortBy === 'sensorId') {
      sortStage.sensorId = sortOrder === 'ascending' ? 1 : -1;
    }

    const skip = (pagination.page - 1) * pagination.limit;

    // 🚀 SINGLE PIPELINE that gets everything at once!
    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      
      // Fork the pipeline into multiple branches
      {
        $facet: {
          // Branch 1: Get total count
          totalCount: [
            { $count: "count" }
          ],
          
          // Branch 2: Get paginated data  
          paginatedData: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: pagination.limit },
            {
              $project: {
                _id: 0,
                sensorId: 1,
                ts: 1,
                value: 1
              }
            }
          ],
          
          // Branch 3: Get summary statistics (sample for performance)
          summaryStats: [
            // Sample for performance on large datasets
            { $sample: { size: Math.min(10000, 1000) } }, // Max 10k samples for stats
            {
              $group: {
                _id: null,
                min: { $min: '$value' },
                max: { $max: '$value' },
                avg: { $avg: '$value' },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    const pipelineStart = Date.now();
    
    const [result] = await this.telModel.aggregate(pipeline).exec();
    
    const pipelineTime = Date.now() - pipelineStart;

    // Extract results
    const totalRecords = result.totalCount[0]?.count || 0;
    const paginatedData = result.paginatedData || [];
    const stats = result.summaryStats[0] || { min: 0, max: 0, avg: 0, count: 0 };

    const summary = {
      min: stats.min || 0,
      max: stats.max || 0,
      avg: Math.round((stats.avg || 0) * 100) / 100,
      totalDataPoints: totalRecords
    };

    return {
      totalRecords,
      paginatedData,
      summary
    };
  }
}
