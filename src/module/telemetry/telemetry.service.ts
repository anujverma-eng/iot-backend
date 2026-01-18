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
  ) { }

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

    // 🔍 SMART DETECTION: For multiple sensors, check if this is a comparison query
    const sensorIds = match.sensorId?.$in || [];
    const isComparison = Array.isArray(sensorIds) && sensorIds.length > 1;

    console.log(`\n🔍 === OPTIMIZATION STRATEGY SELECTION ===`);
    console.log(`📊 Total data points: ${totalCount}, Target: ${targetPoints}`);
    console.log(`🎛️ Sensors in query: ${JSON.stringify(sensorIds)}`);
    console.log(`🎯 Is comparison mode? ${isComparison} (${sensorIds.length} sensors)`);

    if (isComparison) {
      console.log(`🎯 COMPARISON MODE: Detected ${sensorIds.length} sensors, using intersection-based sampling`);
      console.log(`📝 Sensor IDs: ${sensorIds.join(', ')}`);

      try {
        const intersectionResult = await this.intersectionBasedSampling(match, targetPoints);
        const successThreshold = targetPoints * 0.2; // Lower threshold for intersection - even 20% is valuable

        console.log(`📊 Intersection result: ${intersectionResult.length} points (threshold: ${successThreshold})`);

        if (intersectionResult.length >= successThreshold) {
          console.log(`✅ Intersection-based sampling successful: ${intersectionResult.length} points`);
          console.log(`🏁 === USING INTERSECTION-BASED STRATEGY ===\n`);
          return intersectionResult;
        } else {
          console.log(`⚠️ Intersection-based sampling returned too few points: ${intersectionResult.length} < ${successThreshold}`);
          console.log(`🔄 Will fall back to statistical sampling for comparison mode`);
        }
      } catch (error) {
        console.log(`❌ Intersection-based sampling failed: ${error.message}`);
        console.log(`📋 Stack trace:`, error.stack);
      }
    }

    // 🚀 Use time-uniform stratified sampling (like Google/stock charts)
    // This distributes buckets evenly across the REQUESTED time range
    // Returns fewer points only if data doesn't exist in some time buckets (correct behavior)
    try {
      const result = await this.statisticalSamplingPipeline(match, targetPoints);
      console.log(`✅ Time-uniform sampling returned ${result.length} points`);
      return result;
    } catch (error) {
      console.log(`❌ Time-uniform sampling failed: ${error.message}`);
      return this.timeBucketSamplingPipeline(match, targetPoints);
    }
  }

  /**
   * 📏 BOUNDARY POINT EXTRACTION
   * Fetches the first 5 and last 10 data points for each sensor in the time range.
   * This ensures downsampled charts have accurate boundary data,
   * similar to how Google/stock market charts preserve edge data for context.
   */
  private async getBoundaryPoints(match: any): Promise<Map<string, { first: any[]; last: any[] }>> {
    const sensorIds = match.sensorId?.$in || [];
    const boundaryMap = new Map<string, { first: any[]; last: any[] }>();

    if (!sensorIds.length) {
      return boundaryMap;
    }

    console.log(`📏 Fetching boundary points (first 5, last 10) for ${sensorIds.length} sensors...`);

    // Fetch first 5 and last 10 points for each sensor
    for (const sensorId of sensorIds) {
      const sensorMatch = { ...match, sensorId };

      // Get first 5 points
      const firstPoints = await this.telModel
        .find(sensorMatch, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: 1 })
        .limit(5)
        .lean();

      // Get last 10 points
      const lastPoints = await this.telModel
        .find(sensorMatch, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: -1 })
        .limit(10)
        .lean();

      // Reverse lastPoints to get chronological order
      lastPoints.reverse();

      if (firstPoints.length > 0 || lastPoints.length > 0) {
        boundaryMap.set(sensorId, {
          first: firstPoints,
          last: lastPoints
        });
      }
    }

    console.log(`📏 Found boundary points for ${boundaryMap.size} sensors`);
    boundaryMap.forEach((boundaries, sensorId) => {
      console.log(`   📈 ${sensorId}: first ${boundaries.first.length} points, last ${boundaries.last.length} points`);
      if (boundaries.first.length > 0) {
        console.log(`      First: ${boundaries.first[0].ts.toISOString()} to ${boundaries.first[boundaries.first.length - 1]?.ts.toISOString()}`);
      }
      if (boundaries.last.length > 0) {
        console.log(`      Last: ${boundaries.last[0].ts.toISOString()} to ${boundaries.last[boundaries.last.length - 1]?.ts.toISOString()}`);
      }
    });

    return boundaryMap;
  }

  /**
   * 🔀 MERGE BOUNDARY POINTS WITH SAMPLED DATA
   * Combines boundary points (first 5, last 10) with sampled data, ensuring no duplicates
   * and maintaining chronological order.
   */
  private mergeBoundaryWithSampledData(
    boundaryMap: Map<string, { first: any[]; last: any[] }>,
    sampledData: any[]
  ): any[] {
    if (boundaryMap.size === 0) {
      return sampledData;
    }

    // Create a set of existing timestamps per sensor to avoid duplicates
    const existingTimestamps = new Map<string, Set<number>>();
    sampledData.forEach(point => {
      if (!existingTimestamps.has(point.sensorId)) {
        existingTimestamps.set(point.sensorId, new Set());
      }
      existingTimestamps.get(point.sensorId)!.add(point.ts.getTime());
    });

    const result = [...sampledData];
    let addedFirst = 0;
    let addedLast = 0;

    // Add boundary points if they don't already exist in sampled data
    boundaryMap.forEach((boundaries, sensorId) => {
      const sensorTimestamps = existingTimestamps.get(sensorId) || new Set();

      // Add first points if not already present
      boundaries.first.forEach(point => {
        if (!sensorTimestamps.has(point.ts.getTime())) {
          result.push(point);
          sensorTimestamps.add(point.ts.getTime());
          addedFirst++;
        }
      });

      // Add last points if not already present
      boundaries.last.forEach(point => {
        if (!sensorTimestamps.has(point.ts.getTime())) {
          result.push(point);
          sensorTimestamps.add(point.ts.getTime());
          addedLast++;
        }
      });
    });

    if (addedFirst > 0 || addedLast > 0) {
      console.log(`   ➕ Added ${addedFirst} first boundary points and ${addedLast} last boundary points`);
    }

    // Sort by timestamp to maintain chronological order
    result.sort((a, b) => a.ts.getTime() - b.ts.getTime());

    return result;
  }


  /**
   * Index-based stratified sampling - ensures we return close to target points
   * 🎯 Like Google/stock charts: picks every N/K-th point from sorted data
   * This guarantees returning ~target points when enough data exists
   * 🎯 BOUNDARY PRESERVATION: Always includes first and last data points
   */
  private async statisticalSamplingPipeline(match: any, targetPoints: number) {
    console.log(`\n📊 === INDEX-BASED STRATIFIED SAMPLING ===`);

    // Step 1: Get boundary points for all sensors
    const boundaryMap = await this.getBoundaryPoints(match);
    const sensorIds = match.sensorId?.$in || [];

    // Step 2: Calculate adjusted target (reserve space for boundary points: 5 first + 10 last per sensor)
    const boundaryPointsCount = boundaryMap.size * 15;
    const adjustedTarget = Math.max(targetPoints - boundaryPointsCount, Math.floor(targetPoints * 0.8));

    console.log(`📊 Target: ${targetPoints}, Boundaries reserved: ${boundaryPointsCount}, Adjusted sample: ${adjustedTarget}`);

    // Step 3: Get total count to calculate sampling step
    const totalCount = await this.telModel.countDocuments(match);

    if (totalCount === 0) {
      console.log(`❌ No data found`);
      return [];
    }

    console.log(`📊 Total documents: ${totalCount}`);

    // Step 4: If data fits in target, return all
    if (totalCount <= adjustedTarget) {
      console.log(`📊 Data count (${totalCount}) <= target (${adjustedTarget}), returning all data`);
      const allData = await this.telModel
        .find(match, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: 1 })
        .lean();
      return this.mergeBoundaryWithSampledData(boundaryMap, allData);
    }

    // Step 5: Calculate step size - pick every step-th document
    // Use $bucketAuto to divide into equal-sized buckets by count, not by time
    const step = Math.floor(totalCount / adjustedTarget);

    console.log(`📊 Sampling step: every ${step}th point (${totalCount} / ${adjustedTarget})`);

    // Step 6: Use aggregation with $sample is not ideal, use skip-limit pattern
    // Better approach: Use bucket by row number
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { ts: 1 } },
      {
        // Add row number
        $setWindowFields: {
          sortBy: { ts: 1 },
          output: {
            rowNumber: { $documentNumber: {} }
          }
        }
      },
      {
        // Keep every step-th row (modulo operation)
        $match: {
          $expr: {
            $eq: [{ $mod: ['$rowNumber', step] }, 0]
          }
        }
      },
      { $limit: adjustedTarget },
      {
        $project: {
          _id: 0,
          sensorId: 1,
          ts: 1,
          value: 1,
        },
      },
    ];

    const sampledData = await this.telModel.aggregate(pipeline).exec();

    // Log distribution by day for verification
    const dayDistribution = new Map<string, number>();
    sampledData.forEach((point: any) => {
      const day = point.ts.toISOString().split('T')[0];
      dayDistribution.set(day, (dayDistribution.get(day) || 0) + 1);
    });

    console.log(`📊 Index-based sampled ${sampledData.length} points (expected ~${adjustedTarget})`);
    console.log(`📊 Distribution by day:`, Object.fromEntries(dayDistribution));

    // Step 7: Merge boundary points with sampled data
    const result = this.mergeBoundaryWithSampledData(boundaryMap, sampledData);

    console.log(`✅ Final result: ${result.length} points (with boundaries preserved)`);
    console.log(`📏 === INDEX-BASED SAMPLING COMPLETE ===\n`);

    return result;
  }

  /**
   * 🎯 INTERSECTION-BASED COMPARISON SAMPLING
   * Finds actual common timestamps where both sensors have data
   * Then applies existing optimization on the intersection for true comparative analysis
   * 🎯 Now with BOUNDARY PRESERVATION: Always includes first and last data points
   */
  private async intersectionBasedSampling(match: any, targetPoints: number) {
    console.log(`\n🎯 === INTERSECTION-BASED COMPARISON WITH BOUNDARY PRESERVATION ===`);
    console.log(`🔍 Target points requested: ${targetPoints}`);

    const sensorIds = match.sensorId?.$in || [];
    if (sensorIds.length < 2) {
      console.log(`❌ Need at least 2 sensors for intersection analysis`);
      return [];
    }

    // Step 0: Get boundary points for all sensors FIRST
    const boundaryMap = await this.getBoundaryPoints(match);
    const boundaryPointsCount = boundaryMap.size * 15; // 5 first + 10 last per sensor
    const adjustedTarget = Math.max(targetPoints - boundaryPointsCount, Math.floor(targetPoints * 0.8));

    console.log(`🎯 Boundaries reserved: ${boundaryPointsCount}, Adjusted target: ${adjustedTarget}`);

    console.log(`📊 Finding common timestamps for sensors: [${sensorIds.join(', ')}]`);
    console.log(`📋 Match condition:`, JSON.stringify(match, null, 2));

    // Step 1: Find all unique timestamps where we have data from ALL sensors
    const intersectionPipeline: PipelineStage[] = [
      { $match: match },

      // Group by timestamp and collect which sensors have data at each time
      {
        $group: {
          _id: '$ts', // Group by exact timestamp
          sensorsPresent: { $addToSet: '$sensorId' },
          sensorData: {
            $push: {
              sensorId: '$sensorId',
              value: '$value'
            }
          }
        }
      },

      // Only keep timestamps where ALL sensors have data
      {
        $match: {
          $expr: {
            $eq: [{ $size: '$sensorsPresent' }, sensorIds.length]
          }
        }
      },

      // Sort by timestamp
      { $sort: { '_id': 1 } },

      // Project to clean format
      {
        $project: {
          _id: 0,
          ts: '$_id',
          sensorData: 1
        }
      }
    ];

    console.log(`🔍 Executing intersection pipeline...`);

    const intersectionResult = await this.telModel.aggregate(intersectionPipeline).exec();

    console.log(`📊 Raw intersection result length: ${intersectionResult?.length || 0}`);

    if (!intersectionResult || intersectionResult.length === 0) {
      console.log(`❌ No common timestamps found between sensors`);

      // Debug: Let's see what we do have for each sensor individually
      console.log(`🔍 Debugging - checking individual sensor data...`);
      for (const sensorId of sensorIds) {
        const sensorMatch = { ...match, sensorId: sensorId };
        const sensorCount = await this.telModel.countDocuments(sensorMatch);
        const sampleData = await this.telModel.find(sensorMatch).limit(3).sort({ ts: 1 });
        console.log(`   📈 Sensor ${sensorId}: ${sensorCount} total records`);
        console.log(`   📝 Sample timestamps:`, sampleData.map(d => d.ts.toISOString()));
      }

      console.log(`🔄 Falling back to individual sensor optimization with boundary preservation`);
      // Return boundary points even if no intersection found
      const boundaryOnlyResult: any[] = [];
      boundaryMap.forEach((boundaries, sensorId) => {
        // Add all first boundary points
        boundaryOnlyResult.push(...boundaries.first);
        // Add all last boundary points
        boundaryOnlyResult.push(...boundaries.last);
      });
      return boundaryOnlyResult.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    }

    console.log(`✅ Found ${intersectionResult.length} common timestamps`);

    // Step 2: Apply existing optimization on the intersection data
    let optimizedIntersection;

    if (intersectionResult.length <= adjustedTarget) {
      // If intersection is already small enough, return all
      console.log(`✅ Intersection size (${intersectionResult.length}) <= adjusted target (${adjustedTarget}), returning all common points`);
      optimizedIntersection = intersectionResult;
    } else {
      // Apply statistical sampling on intersection data
      console.log(`🔧 Intersection too large (${intersectionResult.length} > ${adjustedTarget}), applying optimization`);

      const samplingRatio = adjustedTarget / intersectionResult.length;
      const sampleSize = Math.floor(intersectionResult.length * samplingRatio);

      console.log(`📊 Sampling ${sampleSize} points from ${intersectionResult.length} common timestamps`);

      // Use existing statistical sampling logic
      const indices = new Set<number>();
      while (indices.size < sampleSize) {
        indices.add(Math.floor(Math.random() * intersectionResult.length));
      }

      optimizedIntersection = Array.from(indices)
        .sort((a, b) => a - b)
        .map(i => intersectionResult[i]);
    }

    // Step 3: Transform to expected format
    const sampledResult: any[] = [];

    optimizedIntersection.forEach(point => {
      point.sensorData.forEach((sensor: any) => {
        sampledResult.push({
          sensorId: sensor.sensorId,
          ts: point.ts,
          value: sensor.value
        });
      });
    });

    // Sort by timestamp to maintain chronological order
    sampledResult.sort((a, b) => a.ts.getTime() - b.ts.getTime());

    console.log(`📊 Sampled ${sampledResult.length} intersection points`);

    // Step 4: Merge boundary points with sampled intersection data
    const result = this.mergeBoundaryWithSampledData(boundaryMap, sampledResult);

    // Analyze final results by sensor
    const sensorResults = new Map<string, number>();
    result.forEach(point => {
      const count = sensorResults.get(point.sensorId) || 0;
      sensorResults.set(point.sensorId, count + 1);
    });

    console.log(`✅ Final intersection-based comparison results (with boundaries):`);
    console.log(`   📊 Total comparative points: ${result.length}`);
    console.log(`   🕐 Common timestamps used: ${optimizedIntersection.length}`);
    sensorResults.forEach((count, sensorId) => {
      console.log(`   📈 ${sensorId}: ${count} points`);
    });

    // Show sample data in table format for comparison validation
    if (result.length > 0) {
      console.log(`📝 Sample comparative points (showing synchronized data with boundaries):`);
      const sampleCount = Math.min(5, result.length / sensorIds.length);

      // Create table data for console.table
      const tableData: any[] = [];
      const uniqueTimestamps = [...new Set(result.map(p => p.ts.getTime()))].slice(0, sampleCount);

      for (const tsTime of uniqueTimestamps) {
        const sensorsAtTime = result.filter(p => p.ts.getTime() === tsTime);

        const rowData: any = {
          timestamp: new Date(tsTime).toISOString(),
        };

        // Add each sensor's value as a column
        sensorsAtTime.forEach(sensor => {
          rowData[`${sensor.sensorId.substring(0, 8)}_value`] = sensor.value;
        });

        tableData.push(rowData);
      }

      console.log(`\n📊 === COMPARISON DATA VALIDATION TABLE ===`);
      console.table(tableData);
      console.log(`🔍 This table shows synchronized sensor readings with boundary points preserved`);
    }

    console.log(`🏁 === INTERSECTION-BASED COMPARISON END ===\n`);

    return result;
  }

  /**
   * Time-based bucketing for heavy data reduction at database level
   * 🎯 Now with BOUNDARY PRESERVATION: Always includes first and last data points
   */
  private async timeBucketSamplingPipeline(match: any, targetPoints: number) {
    console.log(`\n⏱️ === TIME BUCKET SAMPLING WITH BOUNDARY PRESERVATION ===`);

    // Step 1: Get boundary points for all sensors FIRST
    const boundaryMap = await this.getBoundaryPoints(match);
    const boundaryPointsCount = boundaryMap.size * 15; // 5 first + 10 last per sensor
    const adjustedTarget = Math.max(targetPoints - boundaryPointsCount, Math.floor(targetPoints * 0.8));

    console.log(`⏱️ Target: ${targetPoints}, Boundaries reserved: ${boundaryPointsCount}, Adjusted bucket target: ${adjustedTarget}`);

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


    // Calculate bucket size to get approximately adjustedTarget buckets
    const bucketSizeMs = Math.max(timeSpanMs / adjustedTarget, 60 * 1000); // Minimum 1 minute

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
      { $limit: adjustedTarget * 2 }, // Allow some extra for processing
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
      if (points.length < adjustedTarget && Math.abs(bucket.maxValue - bucket.avgValue) > Math.abs(bucket.maxValue - bucket.minValue) * 0.1) {
        points.push({
          sensorId: bucket.sensorId,
          ts: bucket.firstPoint.ts,
          value: bucket.maxValue,
        });
      }

      if (points.length < adjustedTarget && Math.abs(bucket.minValue - bucket.avgValue) > Math.abs(bucket.maxValue - bucket.minValue) * 0.1) {
        points.push({
          sensorId: bucket.sensorId,
          ts: bucket.lastPoint.ts,
          value: bucket.minValue,
        });
      }
    });


    // Sort by timestamp and limit to adjusted target
    const bucketedPoints = points
      .sort((a, b) => a.ts.getTime() - b.ts.getTime())
      .slice(0, adjustedTarget);

    console.log(`⏱️ Bucketed ${bucketedPoints.length} middle points`);

    // Step 2: Merge boundary points with bucketed data
    const finalResult = this.mergeBoundaryWithSampledData(boundaryMap, bucketedPoints);

    console.log(`✅ Final result: ${finalResult.length} points (with boundaries preserved)`);
    console.log(`⏱️ === TIME BUCKET SAMPLING COMPLETE ===\n`);

    return finalResult;
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
   * 📥 BULK EXPORT: Estimate export size and duration
   */
  async estimateExportSize(params: {
    sensorIds: string[];
    timeRange: { start: Date; end: Date };
    format?: string;
    includeMetadata?: boolean;
  }) {
    const match = {
      sensorId: { $in: params.sensorIds },
      ts: { $gte: params.timeRange.start, $lte: params.timeRange.end }
    };

    const [countResult] = await this.telModel.aggregate([
      { $match: match },
      { $count: "totalRecords" }
    ]).exec();

    const totalRecords = countResult?.totalRecords || 0;

    // 🎯 REALISTIC ESTIMATION based on actual performance data
    // Real-world performance: ~2000-2500 records/second for streaming CSV export
    // Factors: DB cursor pagination + CSV formatting + network streaming + memory management

    let recordsPerSecond: number;
    let baselineSeconds: number;

    if (totalRecords < 10000) {
      // Small datasets: Higher throughput due to minimal overhead
      recordsPerSecond = 5000;
      baselineSeconds = 2; // Minimum processing time
    } else if (totalRecords < 50000) {
      // Medium datasets: Good throughput
      recordsPerSecond = 3000;
      baselineSeconds = 5;
    } else if (totalRecords < 200000) {
      // Large datasets: MongoDB cursor overhead becomes significant
      recordsPerSecond = 2500;
      baselineSeconds = 10;
    } else {
      // Very large datasets: Memory pressure + extensive cursor pagination
      recordsPerSecond = 2000;
      baselineSeconds = 15;
    }

    // Calculate with overhead factors
    const processingTime = Math.ceil(totalRecords / recordsPerSecond);
    const estimatedSeconds = Math.max(baselineSeconds, processingTime);

    // Add buffer for network/formatting overhead (20% more time)
    const finalEstimateSeconds = Math.ceil(estimatedSeconds * 1.2);

    // 📏 ACCURATE SIZE CALCULATION using the same logic as export
    const format = params.format || 'csv';
    const includeMetadata = params.includeMetadata !== false;

    const accurateContentSize = await this.calculateExportSize({
      sensorIds: params.sensorIds,
      timeRange: params.timeRange,
      format,
      includeMetadata,
      estimatedRecords: totalRecords
    });

    const estimatedSizeKB = Math.ceil(accurateContentSize / 1024);

    return {
      totalRecords,
      estimatedDuration: this.formatDuration(finalEstimateSeconds),
      estimatedSizeKB: estimatedSizeKB,
      estimatedSizeBytes: accurateContentSize,
      recommendedBatchSize: Math.min(10000, Math.max(1000, Math.floor(totalRecords / 10))),
      performanceNote: `Estimated at ${recordsPerSecond} records/sec + ${Math.ceil((finalEstimateSeconds - estimatedSeconds) / finalEstimateSeconds * 100)}% overhead`,
      sizeCalculation: `${format.toUpperCase()} format with ${includeMetadata ? 'metadata' : 'no metadata'}`
    };
  }

  /**
   * 🔄 STREAMING EXPORT: Get data in cursor-based chunks for streaming
   */
  async getExportChunk(params: {
    sensorIds: string[];
    timeRange: { start: Date; end: Date };
    batchSize: number;
    lastId?: string;
  }) {
    const match: any = {
      sensorId: { $in: params.sensorIds },
      ts: { $gte: params.timeRange.start, $lte: params.timeRange.end }
    };

    // Cursor-based pagination using _id for efficiency
    if (params.lastId) {
      // Convert string back to ObjectId for proper MongoDB comparison
      const { ObjectId } = require('mongoose').Types;
      match._id = { $gt: new ObjectId(params.lastId) };
      console.log(`🔍 Using cursor pagination: lastId=${params.lastId.substring(0, 8)}...`);
    } else {
      console.log(`🔍 Starting fresh query (no lastId)`);
    }

    console.log(`📋 Query match:`, JSON.stringify(match, null, 2));
    console.log(`📊 Requesting ${params.batchSize} records...`);

    // Optimize query for streaming performance
    const results = await this.telModel
      .find(match, {
        _id: 1,
        sensorId: 1,
        ts: 1,
        value: 1
      })
      .sort({ _id: 1 })
      .limit(params.batchSize)
      .lean()
      .hint({ _id: 1 }) // Force index on _id for optimal cursor performance
      .exec();

    const lastId = results.length > 0 ? results[results.length - 1]._id.toString() : null;
    const hasMore = results.length === params.batchSize;

    console.log(`✅ Query results: ${results.length} records returned, hasMore=${hasMore}`);
    console.log(`🔗 New lastId: ${lastId?.substring(0, 8)}...`);

    return {
      data: results.map(row => ({
        sensorId: row.sensorId,
        timestamp: row.ts.toISOString(),
        value: row.value
      })),
      lastId,
      hasMore,
      count: results.length
    };
  }

  /**
   * 📊 METADATA: Get sensor metadata for export
   */
  async getExportMetadata(sensorIds: string[]) {
    const pipeline = [
      { $match: { sensorId: { $in: sensorIds } } },
      {
        $group: {
          _id: '$sensorId',
          firstReading: { $min: '$ts' },
          lastReading: { $max: '$ts' },
          totalReadings: { $sum: 1 },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          avgValue: { $avg: '$value' }
        }
      }
    ];

    const metadata = await this.telModel.aggregate(pipeline).exec();
    return metadata.map(meta => ({
      sensorId: meta._id,
      firstReading: meta.firstReading?.toISOString(),
      lastReading: meta.lastReading?.toISOString(),
      totalReadings: meta.totalReadings,
      valueRange: {
        min: meta.minValue,
        max: meta.maxValue,
        avg: Math.round(meta.avgValue * 100) / 100
      }
    }));
  }

  /**
   * 📏 CALCULATE EXPORT SIZE: Pre-calculate exact content length
   * For small datasets (<1000 records): Calculate exactly by processing all data
   * For large datasets: Use sampling with improved accuracy
   */
  async calculateExportSize(params: {
    sensorIds: string[];
    timeRange: { start: Date; end: Date };
    format: string;
    includeMetadata: boolean;
    estimatedRecords: number;
  }) {
    const { format, includeMetadata, estimatedRecords, sensorIds, timeRange } = params;

    console.log(`🔍 SIZE CALCULATION DEBUG:`);
    console.log(`   Format: ${format}`);
    console.log(`   Include Metadata: ${includeMetadata}`);
    console.log(`   Estimated Records: ${estimatedRecords.toLocaleString()}`);

    // 🎯 EXACT CALCULATION for small datasets
    if (estimatedRecords <= 1000) {
      console.log(`   💯 Using EXACT calculation (dataset ≤ 1000 records)`);
      return this.calculateExactSize({ sensorIds, timeRange, format, includeMetadata });
    }

    // 🎯 SAMPLING for large datasets - use fast fallback for very large datasets
    if (estimatedRecords > 50000) {
      console.log(`   ⚡ Very large dataset (${estimatedRecords.toLocaleString()}) - using fast estimation`);
      // Use fixed average sizes for very large datasets to avoid expensive queries
      const avgRecordSize = format === 'csv' ?
        (includeMetadata ? 120 : 60) :
        (includeMetadata ? 180 : 95);

      const projectedSize = estimatedRecords * avgRecordSize;
      const finalSize = Math.ceil(projectedSize * 1.02); // 2% buffer

      console.log(`   ⚡ Fast estimation: ${avgRecordSize} bytes/record × ${estimatedRecords} = ${finalSize.toLocaleString()} bytes`);
      return finalSize;
    }

    console.log(`   📊 Using SAMPLING calculation (dataset > 1000 records)`);
    const sampleSize = Math.min(50, estimatedRecords); // Reduce sample size for performance
    const sampleData = await this.telModel
      .find({
        sensorId: { $in: sensorIds },
        ts: { $gte: timeRange.start, $lte: timeRange.end }
      })
      .limit(sampleSize)
      .lean()
      .exec();

    if (sampleData.length === 0) {
      console.log(`⚠️ No sample data found, using fallback estimation`);
      return 1000; // Fallback minimal size
    }

    console.log(`   📊 Sample size: ${sampleData.length} records`);

    // Calculate sizes based on actual data
    let totalSampleSize = 0;

    if (format === 'csv') {
      // CSV Header
      const headerSize = includeMetadata
        ? 'sensorId,timestamp,value,metadata\n'.length
        : 'sensorId,timestamp,value\n'.length;

      totalSampleSize += headerSize;

      // Get metadata if needed
      let metadata: any = {};
      if (includeMetadata) {
        const metaArray = await this.getExportMetadata(sensorIds);
        metadata = metaArray.reduce((acc, meta) => {
          acc[meta.sensorId] = meta;
          return acc;
        }, {});
      }

      // Calculate actual row sizes
      sampleData.forEach(row => {
        if (includeMetadata && metadata[row.sensorId]) {
          const metaStr = JSON.stringify(metadata[row.sensorId]).replace(/"/g, '""');
          const csvRow = `"${row.sensorId}","${row.ts.toISOString()}",${row.value},"${metaStr}"\n`;
          totalSampleSize += csvRow.length;
        } else {
          const csvRow = `"${row.sensorId}","${row.ts.toISOString()}",${row.value}\n`;
          totalSampleSize += csvRow.length;
        }
      });

    } else if (format === 'json') {
      // JSON wrapper
      totalSampleSize += '{"data":['.length + ']}'.length;

      // Get metadata if needed
      let metadata: any = {};
      if (includeMetadata) {
        const metaArray = await this.getExportMetadata(sensorIds);
        metadata = metaArray.reduce((acc, meta) => {
          acc[meta.sensorId] = meta;
          return acc;
        }, {});
      }

      // Calculate actual JSON object sizes
      sampleData.forEach((row, index) => {
        const jsonRow = includeMetadata
          ? {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value,
            metadata: metadata[row.sensorId]
          }
          : {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value
          };

        const jsonString = JSON.stringify(jsonRow);
        totalSampleSize += jsonString.length;

        // Add comma except for last item
        if (index < sampleData.length - 1) {
          totalSampleSize += 1; // comma
        }
      });

    } else if (format === 'jsonl') {
      // Get metadata if needed
      let metadata: any = {};
      if (includeMetadata) {
        const metaArray = await this.getExportMetadata(sensorIds);
        metadata = metaArray.reduce((acc, meta) => {
          acc[meta.sensorId] = meta;
          return acc;
        }, {});
      }

      // Calculate JSONL sizes
      sampleData.forEach(row => {
        const jsonRow = includeMetadata
          ? {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value,
            metadata: metadata[row.sensorId]
          }
          : {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value
          };

        const jsonLine = JSON.stringify(jsonRow) + '\n';
        totalSampleSize += jsonLine.length;
      });
    }

    // Calculate average size per record
    const avgRecordSize = totalSampleSize / Math.max(sampleData.length, 1);

    // Project total size based on sample average
    let projectedSize;
    if (format === 'csv') {
      const headerSize = includeMetadata
        ? 'sensorId,timestamp,value,metadata\n'.length
        : 'sensorId,timestamp,value\n'.length;
      const recordsSize = (estimatedRecords * avgRecordSize * sampleData.length) / sampleSize;
      projectedSize = headerSize + recordsSize;
    } else {
      projectedSize = (estimatedRecords * avgRecordSize * sampleData.length) / sampleSize;
    }

    console.log(`   📏 Sample calculation:`);
    console.log(`   📊 Sample total size: ${totalSampleSize} bytes`);
    console.log(`   📊 Average per record: ${avgRecordSize.toFixed(2)} bytes`);
    console.log(`   📊 Projected total: ${projectedSize.toFixed(0)} bytes`);

    // 🎯 CONSERVATIVE SIZING: Use smaller buffer for better accuracy
    // For small datasets (<1000 records), use minimal buffer
    // For large datasets, use slightly larger buffer for safety
    const bufferPercentage = estimatedRecords < 1000 ? 1.01 : 1.03; // 1% vs 3%
    const finalSize = Math.ceil(projectedSize * bufferPercentage);

    console.log(`   💾 SIZE CALCULATION RESULT:`);
    console.log(`   📊 Base projected size: ${projectedSize.toFixed(0).toLocaleString()} bytes`);
    console.log(`   📊 Buffer applied: ${((bufferPercentage - 1) * 100).toFixed(1)}% (${estimatedRecords < 1000 ? 'small dataset' : 'large dataset'})`);
    console.log(`   📈 Final size (with buffer): ${finalSize.toLocaleString()} bytes`);
    console.log(`   📋 Final size in KB: ${Math.ceil(finalSize / 1024).toLocaleString()} KB`);

    return finalSize;
  }

  /**
   * 🎯 EXACT SIZE CALCULATION: Calculate precise content length for small datasets
   */
  private async calculateExactSize(params: {
    sensorIds: string[];
    timeRange: { start: Date; end: Date };
    format: string;
    includeMetadata: boolean;
  }) {
    const { format, includeMetadata, sensorIds, timeRange } = params;

    console.log(`   🔬 EXACT CALCULATION: Processing all records...`);

    // Get all data (since it's small dataset ≤ 1000 records)
    const allData = await this.telModel
      .find({
        sensorId: { $in: sensorIds },
        ts: { $gte: timeRange.start, $lte: timeRange.end }
      })
      .lean()
      .exec();

    console.log(`   📊 Exact record count: ${allData.length}`);

    if (allData.length === 0) {
      return 50; // Empty response size
    }

    let totalSize = 0;

    // Get metadata if needed
    let metadata: any = {};
    if (includeMetadata) {
      const metaArray = await this.getExportMetadata(sensorIds);
      metadata = metaArray.reduce((acc, meta) => {
        acc[meta.sensorId] = meta;
        return acc;
      }, {});
    }

    if (format === 'csv') {
      // CSV Header
      const csvHeader = includeMetadata
        ? 'sensorId,timestamp,value,metadata\n'
        : 'sensorId,timestamp,value\n';
      totalSize += csvHeader.length;

      // Calculate exact size for each row
      allData.forEach(row => {
        if (includeMetadata && metadata[row.sensorId]) {
          const metaStr = JSON.stringify(metadata[row.sensorId]).replace(/"/g, '""');
          const csvRow = `"${row.sensorId}","${row.ts.toISOString()}",${row.value},"${metaStr}"\n`;
          totalSize += csvRow.length;
        } else {
          const csvRow = `"${row.sensorId}","${row.ts.toISOString()}",${row.value}\n`;
          totalSize += csvRow.length;
        }
      });

    } else if (format === 'json') {
      // JSON wrapper
      totalSize += '{"data":['.length + ']}'.length;

      // Calculate exact size for each JSON object
      allData.forEach((row, index) => {
        const jsonRow = includeMetadata
          ? {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value,
            metadata: metadata[row.sensorId]
          }
          : {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value
          };

        const jsonString = JSON.stringify(jsonRow);
        totalSize += jsonString.length;

        // Add comma except for last item
        if (index < allData.length - 1) {
          totalSize += 1; // comma
        }
      });

    } else if (format === 'jsonl') {
      // Calculate JSONL sizes
      allData.forEach(row => {
        const jsonRow = includeMetadata
          ? {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value,
            metadata: metadata[row.sensorId]
          }
          : {
            sensorId: row.sensorId,
            timestamp: row.ts.toISOString(),
            value: row.value
          };

        const jsonLine = JSON.stringify(jsonRow) + '\n';
        totalSize += jsonLine.length;
      });
    }

    console.log(`   🎯 EXACT SIZE RESULT: ${totalSize} bytes (no buffer needed)`);
    return totalSize;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.ceil(seconds / 3600)}h`;
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
