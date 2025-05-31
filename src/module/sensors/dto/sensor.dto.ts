import {
  IsBoolean,
  IsEnum,
  IsMACAddress,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { SensorType } from '../enums/sensor.enum';
import { Expose, Transform } from 'class-transformer';

export class CreateSensorDto {
  /** MAC becomes the Mongo _id */
  @IsString()
  _id: string;

  @IsString()
  mac: string;

  @IsMongoId()
  @IsOptional()
  orgId?: string;

  @IsOptional()
  @IsEnum(SensorType)
  type?: SensorType;

  @IsOptional()
  @IsString()
  unit?: string;

  // dashboard helpers
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  lastValue?: number;

  @IsOptional()
  @IsString()
  lastUnit?: string;

  @IsBoolean()
  ignored: boolean;
}

export class UpdateSensorDto extends CreateSensorDto {}

export class SensorResponseDto {
  @Expose()
  _id: string;

  @Expose()
  mac: string;

  @Expose()
  type?: SensorType;

  @Expose()
  unit?: string;

  @Expose()
  displayName?: string;

  @Expose()
  lastValue?: number;

  @Expose()
  lastUnit?: string;

  @Expose()
  lastSeenBy?: string[];

  @Expose()
  lastSeen?: Date;

  @Expose()
  claimed: boolean;

  @Expose()
  ignored: boolean;

  /** strip Mongo internals */
  @Transform(() => undefined, { toPlainOnly: true })
  __v?: never;
  @Transform(() => undefined, { toPlainOnly: true })
  createdAt?: never;
  @Transform(() => undefined, { toPlainOnly: true })
  updatedAt?: never;
}

/** Body payload for POST /sensors/claim */
export class ClaimSensorDto {
  /** Printed on the probe label */
  @Matches(/^([0-9A-F]{2}:){3,5}[0-9A-F]{2}$/i, {
    message: 'mac must be 4-octet or 6-octet colon-separated hex',
  })
  mac!: string;

  /** Optional friendly name that shows up in dashboards */
  @IsOptional()
  @IsString()
  displayName?: string;
}
