// src/module/telemetry/dto/telemetry.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Bucket } from '../enum/telemetry.enum';
import { StringValue } from 'ms';

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
  @Transform(
    ({ value }) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value], // wrap single value into array
  )
  @IsArray()
  @ArrayNotEmpty()
  sensorIds?: string[];
}

class TimeRangeDto {
  @IsISO8601() start!: string;
  @IsISO8601() end!: string;
}

export class TelemetryQueryBody {
  /** sensors we want in the payload           */
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  sensorIds!: string[];

  /** { start, end } — both ISO strings        */
  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange!: TimeRangeDto;

  /** optional roll-up like “15m”, “1h”, “1d”  */
  @IsOptional()
  @IsString()
  bucketSize?: StringValue;
}
