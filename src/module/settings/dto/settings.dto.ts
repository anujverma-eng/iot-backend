import { IsNumber, IsOptional, Min, IsEnum, IsString } from 'class-validator';
import { OrgChoiceMode } from '../settings.schema';

// Organization Settings DTOs
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

// User Settings DTOs
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  defaultOrgId?: string; // Required when orgChoiceMode is 'remember', ignored when 'ask-every-time'

  @IsOptional()
  @IsEnum(OrgChoiceMode, { 
    message: 'orgChoiceMode must be either "remember" or "ask-every-time"' 
  })
  orgChoiceMode?: OrgChoiceMode;
}
