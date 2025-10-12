// src/module/telemetry/dto/optimized-telemetry.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class TimeRangeDto {
  @IsISO8601()
  start!: string;

  @IsISO8601() 
  end!: string;
}

class LiveModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Max(100)
  maxReadings?: number;
}

class PaginationDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  page!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(1000)
  limit!: number;
}

export class OptimizedTelemetryQueryDto {
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  sensorIds!: string[];

  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange!: TimeRangeDto;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(50)
  @Max(2000)
  targetPoints!: number;

  @IsOptional()
  @IsEnum(['mobile', 'desktop'])
  deviceType?: 'mobile' | 'desktop';

  @IsOptional()
  @ValidateNested()
  @Type(() => LiveModeDto)
  liveMode?: LiveModeDto;
}

export class TableDataQueryDto {
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  sensorIds!: string[];

  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange!: TimeRangeDto;

  @ValidateNested()
  @Type(() => PaginationDto)
  pagination!: PaginationDto;

  @IsOptional()
  @IsEnum(['timestamp', 'value', 'sensorId'])
  sortBy?: 'timestamp' | 'value' | 'sensorId';

  @IsOptional()
  @IsEnum(['ascending', 'descending'])
  sortOrder?: 'ascending' | 'descending';

  @IsOptional()
  @IsString()
  search?: string;
}

// Response types
export interface OptimizedDataPoint {
  timestamp: string;
  value: number;
}

export interface OptimizationInfo {
  originalCount: number;
  optimizedCount: number;
  strategy: 'none' | 'statistical-sampling' | 'lod-sampling' | 'adaptive-sampling' | 'time-bucket-aggregation' | 'sliding-window' | 'database-optimized';
}

export interface OptimizedSensorData {
  sensorId: string;
  mac: string;
  type: string;
  unit: string;
  data: OptimizedDataPoint[];
  min: number;
  max: number;
  avg: number;
  current: number | null;
  optimization: OptimizationInfo;
}

export interface TableDataPoint {
  timestamp: string;
  value: number;
}

export interface TableSensorData {
  sensorId: string;
  mac: string;
  type: string;
  unit: string;
  data: TableDataPoint[];
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  hasNext: boolean;
  hasPrev: boolean;
  limit: number;
}

export interface TableDataSummary {
  min: number;
  max: number;
  avg: number;
  totalDataPoints: number;
}