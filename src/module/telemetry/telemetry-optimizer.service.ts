// src/module/telemetry/telemetry-optimizer.service.ts
import { Injectable } from '@nestjs/common';

interface DataPoint {
  ts: Date;
  value: number;
  sensorId: string;
}

interface OptimizedPoint {
  timestamp: string;
  value: number;
}

interface OptimizationResult {
  data: OptimizedPoint[];
  originalCount: number;
  optimizedCount: number;
  strategy: 'none' | 'statistical-sampling' | 'lod-sampling' | 'adaptive-sampling' | 'time-bucket-aggregation' | 'sliding-window' | 'database-optimized';
}

@Injectable()
export class TelemetryOptimizerService {
  
  /**
   * Main optimization method that intelligently selects the best algorithm
   */
  optimizeData(
    rawData: DataPoint[],
    targetPoints: number,
    deviceType: 'mobile' | 'desktop' = 'desktop',
    liveMode: boolean = false,
    maxLiveReadings: number = 100
  ): OptimizationResult {
    if (!rawData.length) {
      return {
        data: [],
        originalCount: 0,
        optimizedCount: 0,
        strategy: 'none'
      };
    }

    // Live mode override - always limit to maxLiveReadings
    if (liveMode) {
      return this.applySlidingWindow(rawData, Math.min(maxLiveReadings, targetPoints));
    }

    // Decision tree for algorithm selection
    const dataSize = rawData.length;
    const timeSpan = this.getTimeSpanInHours(rawData);
    const dataPattern = this.analyzeDataPattern(rawData);
    
    // Apply device-specific adjustments
    const adjustedTargetPoints = this.adjustTargetForDevice(targetPoints, deviceType);

    // Step 1: Check data size
    if (dataSize <= 1000) {
      // Small dataset - return original or light optimization
      if (dataSize <= adjustedTargetPoints) {
        return {
          data: this.convertToOptimizedPoints(rawData),
          originalCount: dataSize,
          optimizedCount: dataSize,
          strategy: 'none'
        };
      }
      return this.applyStatisticalSampling(rawData, adjustedTargetPoints);
    }

    // Step 2: Check time span and apply appropriate strategy
    if (timeSpan <= 24) { // Less than 1 day
      if (dataPattern === 'spiky') {
        return this.applyLODSampling(rawData, adjustedTargetPoints);
      } else {
        return this.applyStatisticalSampling(rawData, adjustedTargetPoints);
      }
    } else { // For longer periods, use smart time bucketing that respects targetPoints
      return this.applySmartTimeBucketAggregation(rawData, adjustedTargetPoints);
    }
  }

  /**
   * Statistical Sampling - Best for smooth, gradual data
   */
  private applyStatisticalSampling(rawData: DataPoint[], targetPoints: number): OptimizationResult {
    const groupSize = Math.ceil(rawData.length / targetPoints);
    const optimized: OptimizedPoint[] = [];
    
    // Always keep first and last points
    optimized.push(this.convertToOptimizedPoint(rawData[0]));
    
    for (let i = groupSize; i < rawData.length - groupSize; i += groupSize) {
      const group = rawData.slice(i, Math.min(i + groupSize, rawData.length));
      
      // Find the point closest to the group average
      const avg = group.reduce((sum, p) => sum + p.value, 0) / group.length;
      const representative = group.reduce((closest, current) => 
        Math.abs(current.value - avg) < Math.abs(closest.value - avg) ? current : closest
      );
      
      optimized.push(this.convertToOptimizedPoint(representative));
      
      // Also preserve extreme values in this group
      const min = group.reduce((min, p) => p.value < min.value ? p : min);
      const max = group.reduce((max, p) => p.value > max.value ? p : max);
      
      if (Math.abs(min.value - avg) > Math.abs(max.value - representative.value) * 0.1) {
        optimized.push(this.convertToOptimizedPoint(min));
      }
      if (Math.abs(max.value - avg) > Math.abs(max.value - representative.value) * 0.1) {
        optimized.push(this.convertToOptimizedPoint(max));
      }
    }
    
    // Always keep last point
    if (rawData.length > 1) {
      optimized.push(this.convertToOptimizedPoint(rawData[rawData.length - 1]));
    }
    
    // Remove duplicates and sort by timestamp
    const unique = this.removeDuplicatesAndSort(optimized);
    
    return {
      data: unique.slice(0, targetPoints),
      originalCount: rawData.length,
      optimizedCount: unique.length,
      strategy: 'statistical-sampling'
    };
  }

  /**
   * Level of Detail (LOD) Sampling - Best for spiky, variable data
   */
  private applyLODSampling(rawData: DataPoint[], targetPoints: number): OptimizationResult {
    const optimized: OptimizedPoint[] = [];
    
    // Find significant events (peaks, valleys, trend changes)
    const events = this.findSignificantEvents(rawData);
    
    // Always include events
    events.forEach(point => {
      optimized.push(this.convertToOptimizedPoint(point));
    });
    
    // Fill remaining points with representative samples from quiet periods
    const remainingPoints = targetPoints - optimized.length;
    if (remainingPoints > 0) {
      const quietPeriods = this.findQuietPeriods(rawData, events);
      const sampledQuiet = this.sampleFromPeriods(quietPeriods, remainingPoints);
      optimized.push(...sampledQuiet.map(p => this.convertToOptimizedPoint(p)));
    }
    
    const unique = this.removeDuplicatesAndSort(optimized);
    
    return {
      data: unique.slice(0, targetPoints),
      originalCount: rawData.length,
      optimizedCount: unique.length,
      strategy: 'lod-sampling'
    };
  }

  /**
   * Smart Time Bucket Aggregation - Prioritizes user's targetPoints over time assumptions
   * Calculates optimal bucket size to get close to the requested number of points
   */
  private applySmartTimeBucketAggregation(
    rawData: DataPoint[], 
    targetPoints: number
  ): OptimizationResult {
    if (rawData.length === 0) {
      return {
        data: [],
        originalCount: 0,
        optimizedCount: 0,
        strategy: 'time-bucket-aggregation'
      };
    }

    // Sort data by timestamp to ensure proper time-based processing
    const sortedData = rawData.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    
    // Calculate total time span
    const timeSpanMs = sortedData[sortedData.length - 1].ts.getTime() - sortedData[0].ts.getTime();
    
    // Calculate optimal bucket size based on targetPoints
    // We want approximately targetPoints buckets, so divide the time span by targetPoints
    const optimalBucketSize = Math.max(timeSpanMs / targetPoints, 60 * 1000); // Minimum 1 minute buckets
    
    // Round to sensible time intervals
    const bucketSize = this.roundToSensibleInterval(optimalBucketSize);
    
    const buckets = new Map<number, DataPoint[]>();
    
    // Group data into time buckets
    sortedData.forEach(point => {
      const bucketKey = Math.floor(point.ts.getTime() / bucketSize) * bucketSize;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(point);
    });
    
    const optimized: OptimizedPoint[] = [];
    
    // Process each bucket - prioritize getting close to targetPoints
    const bucketEntries = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
    const maxBucketsToProcess = Math.min(bucketEntries.length, targetPoints);
    
    // If we have more buckets than targetPoints, we need to be selective
    if (bucketEntries.length > targetPoints) {
      // Take every Nth bucket to stay within targetPoints
      const step = bucketEntries.length / targetPoints;
      for (let i = 0; i < bucketEntries.length && optimized.length < targetPoints; i += step) {
        const bucketIndex = Math.floor(i);
        const [bucketTime, points] = bucketEntries[bucketIndex];
        if (points.length === 0) continue;
        
        const bucketPoint = this.processBucket(bucketTime, points, bucketSize);
        optimized.push(bucketPoint);
      }
    } else {
      // We have fewer buckets than targetPoints, process all buckets
      // and potentially add multiple points per bucket if needed
      for (const [bucketTime, points] of bucketEntries) {
        if (points.length === 0) continue;
        
        const bucketPoints = this.processBucketWithMultiplePoints(
          bucketTime, 
          points, 
          bucketSize, 
          Math.max(1, Math.floor(targetPoints / bucketEntries.length))
        );
        optimized.push(...bucketPoints);
        
        // Stop if we've reached our target
        if (optimized.length >= targetPoints) {
          break;
        }
      }
    }
    
    // Always ensure we have first and last points for continuity
    if (optimized.length > 0) {
      const firstOriginal = this.convertToOptimizedPoint(sortedData[0]);
      const lastOriginal = this.convertToOptimizedPoint(sortedData[sortedData.length - 1]);
      
      // Add first point if it's not already close to an existing point
      if (!optimized.some(p => Math.abs(new Date(p.timestamp).getTime() - new Date(firstOriginal.timestamp).getTime()) < bucketSize / 2)) {
        optimized.unshift(firstOriginal);
      }
      
      // Add last point if it's not already close to an existing point  
      if (!optimized.some(p => Math.abs(new Date(p.timestamp).getTime() - new Date(lastOriginal.timestamp).getTime()) < bucketSize / 2)) {
        optimized.push(lastOriginal);
      }
    }
    
    const unique = this.removeDuplicatesAndSort(optimized);
    
    // Final trim to exact targetPoints if we exceeded
    const finalData = unique.slice(0, targetPoints);
    
    return {
      data: finalData,
      originalCount: rawData.length,
      optimizedCount: finalData.length,
      strategy: 'time-bucket-aggregation'
    };
  }

  /**
   * Sliding Window - For live mode
   */
  private applySlidingWindow(rawData: DataPoint[], maxPoints: number): OptimizationResult {
    const sortedData = rawData.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    const recentData = sortedData.slice(0, maxPoints);
    
    return {
      data: recentData.map(p => this.convertToOptimizedPoint(p)).reverse(), // Reverse to get chronological order
      originalCount: rawData.length,
      optimizedCount: recentData.length,
      strategy: 'sliding-window'
    };
  }

  /**
   * Helper methods
   */
  private getTimeSpanInHours(data: DataPoint[]): number {
    if (data.length < 2) return 0;
    const sorted = data.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    return (sorted[sorted.length - 1].ts.getTime() - sorted[0].ts.getTime()) / (1000 * 60 * 60);
  }

  private analyzeDataPattern(data: DataPoint[]): 'smooth' | 'spiky' | 'gradual' {
    if (data.length < 10) return 'smooth';
    
    let changes = 0;
    let totalVariation = 0;
    
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i].value - data[i-1].value);
      totalVariation += diff;
      
      if (i > 1) {
        const prevDiff = Math.abs(data[i-1].value - data[i-2].value);
        if (diff > prevDiff * 2 || diff < prevDiff * 0.5) {
          changes++;
        }
      }
    }
    
    const avgVariation = totalVariation / (data.length - 1);
    const changeRatio = changes / (data.length - 2);
    
    if (changeRatio > 0.3 || avgVariation > this.getValueRange(data) * 0.1) {
      return 'spiky';
    } else if (avgVariation < this.getValueRange(data) * 0.01) {
      return 'gradual';
    }
    return 'smooth';
  }

  private adjustTargetForDevice(targetPoints: number, deviceType: 'mobile' | 'desktop'): number {
    return deviceType === 'mobile' ? Math.min(targetPoints, targetPoints * 0.8) : targetPoints;
  }

  private findSignificantEvents(data: DataPoint[]): DataPoint[] {
    const events: DataPoint[] = [];
    const threshold = this.getValueRange(data) * 0.05; // 5% of total range
    
    // Always include first and last
    events.push(data[0]);
    if (data.length > 1) events.push(data[data.length - 1]);
    
    // Find peaks, valleys, and trend changes
    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const next = data[i + 1];
      
      // Peak
      if (curr.value > prev.value && curr.value > next.value && 
          (curr.value - Math.min(prev.value, next.value)) > threshold) {
        events.push(curr);
      }
      // Valley  
      else if (curr.value < prev.value && curr.value < next.value && 
               (Math.max(prev.value, next.value) - curr.value) > threshold) {
        events.push(curr);
      }
      // Trend change
      else if ((curr.value - prev.value) * (next.value - curr.value) < 0 && 
               Math.abs(curr.value - prev.value) > threshold) {
        events.push(curr);
      }
    }
    
    return events;
  }

  private findQuietPeriods(data: DataPoint[], events: DataPoint[]): DataPoint[] {
    const eventTimes = new Set(events.map(e => e.ts.getTime()));
    return data.filter(p => !eventTimes.has(p.ts.getTime()));
  }

  private sampleFromPeriods(periods: DataPoint[], count: number): DataPoint[] {
    if (periods.length <= count) return periods;
    
    const step = Math.floor(periods.length / count);
    const sampled: DataPoint[] = [];
    
    for (let i = 0; i < periods.length; i += step) {
      if (sampled.length < count) {
        sampled.push(periods[i]);
      }
    }
    
    return sampled;
  }

  private getBucketSizeMs(bucketType: 'hourly' | 'daily' | 'weekly'): number {
    switch (bucketType) {
      case 'hourly': return 60 * 60 * 1000;
      case 'daily': return 24 * 60 * 60 * 1000;
      case 'weekly': return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private getValueRange(data: DataPoint[]): number {
    if (data.length === 0) return 0;
    const values = data.map(p => p.value);
    return Math.max(...values) - Math.min(...values);
  }

  private convertToOptimizedPoint(point: DataPoint): OptimizedPoint {
    return {
      timestamp: point.ts.toISOString(),
      value: point.value
    };
  }

  private convertToOptimizedPoints(points: DataPoint[]): OptimizedPoint[] {
    return points.map(p => this.convertToOptimizedPoint(p));
  }

  private removeDuplicatesAndSort(points: OptimizedPoint[]): OptimizedPoint[] {
    const unique = points.filter((point, index, arr) => 
      arr.findIndex(p => p.timestamp === point.timestamp) === index
    );
    return unique.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Rounds bucket size to sensible time intervals for better UX
   */
  private roundToSensibleInterval(bucketSizeMs: number): number {
    // Convert to seconds for easier calculation
    const seconds = bucketSizeMs / 1000;
    
    // Define sensible intervals in seconds
    const intervals = [
      60,              // 1 minute
      300,             // 5 minutes  
      900,             // 15 minutes
      1800,            // 30 minutes
      3600,            // 1 hour
      7200,            // 2 hours
      14400,           // 4 hours
      21600,           // 6 hours
      43200,           // 12 hours
      86400,           // 1 day
      172800,          // 2 days
      604800,          // 1 week
      1209600,         // 2 weeks
      2592000,         // 1 month (30 days)
    ];
    
    // Find the closest sensible interval
    let bestInterval = intervals[0];
    let minDiff = Math.abs(seconds - bestInterval);
    
    for (const interval of intervals) {
      const diff = Math.abs(seconds - interval);
      if (diff < minDiff) {
        minDiff = diff;
        bestInterval = interval;
      }
    }
    
    return bestInterval * 1000; // Convert back to milliseconds
  }

  /**
   * Process a single bucket and return the most representative point
   */
  private processBucket(bucketTime: number, points: DataPoint[], bucketSize: number): OptimizedPoint {
    if (points.length === 1) {
      return this.convertToOptimizedPoint(points[0]);
    }
    
    // Calculate bucket statistics
    const values = points.map(p => p.value);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Use the point closest to the average as representative
    // This preserves the actual data rather than synthetic averages
    const representative = points.reduce((closest, current) => 
      Math.abs(current.value - avg) < Math.abs(closest.value - avg) ? current : closest
    );
    
    return this.convertToOptimizedPoint(representative);
  }

  /**
   * Process a bucket and return multiple points if needed to reach target
   */
  private processBucketWithMultiplePoints(
    bucketTime: number, 
    points: DataPoint[], 
    bucketSize: number, 
    maxPointsFromBucket: number
  ): OptimizedPoint[] {
    if (points.length === 0) return [];
    if (points.length === 1 || maxPointsFromBucket === 1) {
      return [this.processBucket(bucketTime, points, bucketSize)];
    }
    
    const result: OptimizedPoint[] = [];
    
    // Always include the representative point
    result.push(this.processBucket(bucketTime, points, bucketSize));
    
    // If we need more points, add extremes or evenly distributed samples
    if (maxPointsFromBucket > 1 && points.length > 1) {
      const values = points.map(p => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      
      // Add min/max if they're significantly different from average
      const threshold = Math.abs(max - min) * 0.1;
      let addedPoints = 1; // We already added the representative point
      
      if (Math.abs(min - avg) > threshold && addedPoints < maxPointsFromBucket) {
        const minPoint = points.find(p => p.value === min)!;
        result.push(this.convertToOptimizedPoint(minPoint));
        addedPoints++;
      }
      
      if (Math.abs(max - avg) > threshold && addedPoints < maxPointsFromBucket) {
        const maxPoint = points.find(p => p.value === max)!;
        result.push(this.convertToOptimizedPoint(maxPoint));
        addedPoints++;
      }
      
      // If we still need more points, add evenly distributed samples
      const remaining = maxPointsFromBucket - addedPoints;
      if (remaining > 0 && points.length > addedPoints) {
        const sortedByTime = points.sort((a, b) => a.ts.getTime() - b.ts.getTime());
        const step = Math.max(1, Math.floor(sortedByTime.length / remaining));
        
        for (let i = step; i < sortedByTime.length && result.length < maxPointsFromBucket; i += step) {
          const point = sortedByTime[i];
          // Only add if it's not too close to existing points
          if (!result.some(existing => Math.abs(new Date(existing.timestamp).getTime() - point.ts.getTime()) < bucketSize * 0.1)) {
            result.push(this.convertToOptimizedPoint(point));
          }
        }
      }
    }
    
    return result;
  }
}