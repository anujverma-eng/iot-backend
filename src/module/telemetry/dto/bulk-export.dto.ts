// src/module/telemetry/dto/bulk-export.dto.ts
import { Type } from 'class-transformer';
import { 
  IsArray, 
  IsDateString, 
  IsEnum, 
  IsOptional, 
  IsString, 
  IsNumber, 
  Min, 
  Max,
  IsBoolean
} from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  JSONL = 'jsonl' // JSON Lines for streaming
}

export enum ExportMode {
  STREAM = 'stream',     // Direct streaming response
  BACKGROUND = 'background' // Background job with download link
}

export class BulkExportQueryDto {
  @IsArray()
  @IsString({ each: true })
  sensorIds: string[];

  timeRange: {
    start: string;
    end: string;
  };

  @IsEnum(ExportFormat)
  @IsOptional()
  format?: ExportFormat;

  @IsEnum(ExportMode)
  @IsOptional()
  mode?: ExportMode;

  @IsNumber()
  @Min(1000)
  @Max(50000)
  @IsOptional()
  batchSize?: number;

  @IsNumber()
  @Min(1)
  @Max(1000000)
  @IsOptional()
  maxRecords?: number;

  @IsBoolean()
  @IsOptional()
  includeMetadata?: boolean = false;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsString()
  @IsOptional()
  timezone?: string; // IANA timezone string (e.g., 'Asia/Kolkata', 'America/New_York')
}

export interface ExportProgress {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  totalRecords?: number;
  processedRecords?: number;
  estimatedTimeRemaining?: string;
  downloadUrl?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface StreamingExportResponse {
  success: boolean;
  exportInfo: {
    sensorCount: number;
    estimatedRecords: number;
    format: ExportFormat;
    filename: string;
  };
  // Response will be streamed after this header
}

export interface BackgroundExportResponse {
  success: boolean;
  jobId: string;
  estimatedRecords: number;
  estimatedDuration: string;
  statusUrl: string;
}

export class ExportStatusQueryDto {
  @IsString()
  jobId: string;
}