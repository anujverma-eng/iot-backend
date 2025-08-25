import { IsNumber, IsOptional, Min } from 'class-validator';

export class CreateSettingsDto {
  @IsNumber()
  @Min(1, { message: 'Sensor offline timeout must be at least 1 minute' })
  sensorOfflineTimeOut: number;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Sensor offline timeout must be at least 1 minute' })
  sensorOfflineTimeOut?: number;
}
