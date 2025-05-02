import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { SensorType } from '../enums/sensor.enum';

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
