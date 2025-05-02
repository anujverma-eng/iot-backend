import {
  IsEnum, IsInt, IsOptional, IsPositive, IsString, Min,
} from 'class-validator';
import { PlanName } from '../enums/plan.enum';
import { PartialType } from '@nestjs/mapped-types';

export class CreatePlanDto {
  @IsString()
  @IsEnum(PlanName)       // remove if plan names are free‑text
  name: PlanName;

  @IsInt()
  @Min(0)
  maxGateways: number;

  @IsInt()
  @Min(0)
  maxSensors: number;

  @IsInt()
  @Min(0)
  maxUsers: number;

  @IsInt()
  @IsPositive()
  retentionDays: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  stripePriceId?: string;
  
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
