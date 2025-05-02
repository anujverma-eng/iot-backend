import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlanName } from './enums/plan.enum';

export type PlanDocument = Plan & Document;

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, unique: true, enum: PlanName })
  name: PlanName;

  @Prop({ required: true, min: 0 })
  maxGateways: number;

  @Prop({ required: true, min: 0 })
  maxSensors: number;

  @Prop({ required: true, min: 0 })
  maxUsers: number;

  @Prop({ required: true, min: 0 })
  retentionDays: number;

  // Optional
  @Prop() description?: string;
  @Prop() stripePriceId?: string;
  @Prop([String]) featureFlags?: string[];
  
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
