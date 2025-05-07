// src/module/telemetry/dto/telemetry.dto.ts
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsISO8601, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Bucket } from '../enum/telemetry.enum';


export class TelemetryQuery {
  @IsOptional()
  @IsISO8601()
  from?: string; // ISO date

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  limit = 500; // default 500 rows (server‑side max)
}

export class BucketQueryDto {
  @IsISO8601() from!: string;
  @IsISO8601() to!: string;

  @IsOptional()
  @IsEnum(Bucket)
  bucket: Bucket = Bucket.RAW;

  /** optional filter for specific sensors */
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : Array.isArray(value)
      ? value
      : [value],        // wrap single value into array
  )
  @IsArray()
  @ArrayNotEmpty()
  sensorIds?: string[];
}
