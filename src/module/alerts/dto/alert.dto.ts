import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AlertOperator, AlertType } from '../schemas/alert-rule.schema';

export class AlertConditionDto {
  @IsEnum(AlertOperator)
  operator: AlertOperator;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsNumber()
  value2?: number;
}

export class EmailChannelDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  addresses: string[];
}

export class SmsChannelDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @Matches(/^\+[1-9]\d{1,14}$/, { each: true, message: 'Phone numbers must be in E.164 format (e.g., +1234567890)' })
  phoneNumbers: string[];
}

export class NotificationChannelsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailChannelDto)
  email?: EmailChannelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmsChannelDto)
  sms?: SmsChannelDto;
}

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsEnum(AlertType)
  alertType: AlertType;

  @ValidateIf((o) =>
    o.alertType !== AlertType.DEVICE_ONLINE &&
    o.alertType !== AlertType.DEVICE_OFFLINE,
  )
  @ValidateNested()
  @Type(() => AlertConditionDto)
  condition?: AlertConditionDto;

  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels: NotificationChannelsDto;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(60000)
  throttleMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AlertConditionDto)
  condition?: AlertConditionDto;

  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(60)
  throttleMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ToggleAlertRuleDto {
  @IsBoolean()
  enabled: boolean;
}

export class QueryAlertsDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class QueryAlertHistoryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  acknowledged?: boolean;
}
