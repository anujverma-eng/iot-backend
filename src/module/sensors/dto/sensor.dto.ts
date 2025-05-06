import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { SensorType } from '../enums/sensor.enum';
import { Expose, Transform } from 'class-transformer';

export class CreateSensorDto {
  @IsString()
  _id: string; // gatewayId#sensorMac composite id

  @IsString()
  mac: string;

  @IsString()
  gatewayId: string;

  @IsMongoId()
  orgId: string;

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
  lastSeen?: Date;

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
