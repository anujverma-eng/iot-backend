import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertRuleDocument = AlertRule & Document;

export enum AlertType {
  DEVICE_ONLINE = 'DEVICE_ONLINE',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  LOW_BATTERY = 'LOW_BATTERY',
  DEVICE_OUT_OF_TOLERANCE = 'DEVICE_OUT_OF_TOLERANCE',
}

export enum AlertOperator {
  GT = 'gt',
  LT = 'lt',
  EQ = 'eq',
  GTE = 'gte',
  LTE = 'lte',
  BETWEEN = 'between',
}

export class AlertCondition {
  @Prop({ required: true, enum: Object.values(AlertOperator) })
  operator: AlertOperator;

  @Prop({ required: true })
  value: number;

  @Prop()
  value2?: number; // For 'between' operator
}

export class EmailChannel {
  @Prop({ required: true })
  enabled: boolean;

  @Prop({ type: [String], required: true })
  addresses: string[];
}

export class SmsChannel {
  @Prop({ required: true })
  enabled: boolean;

  @Prop({ type: [String], required: true })
  phoneNumbers: string[];
}

export class NotificationChannels {
  @Prop({ type: EmailChannel })
  email?: EmailChannel;

  @Prop({ type: SmsChannel })
  sms?: SmsChannel;
}

@Schema({ timestamps: true })
export class AlertRule {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: Object.values(AlertType) })
  alertType: AlertType;

  // Single device per alert (sensor MAC or gateway ID)
  @Prop({ type: String, required: true })
  deviceId: string;

  // Display name from sensor.displayName or gateway.label, fallback to deviceId
  @Prop({ required: true })
  displayName: string;

  // Optional for gateway-based alerts; required for sensor-based alerts
  @Prop({ type: AlertCondition })
  condition?: AlertCondition;

  @Prop({ type: NotificationChannels, required: true })
  channels: NotificationChannels;

  @Prop({ required: true, default: 10 })
  throttleMinutes: number;

  @Prop({ required: true, default: true })
  enabled: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  lastTriggeredAt?: Date;

  @Prop({ default: 0 })
  triggerCount: number;
}

export const AlertRuleSchema = SchemaFactory.createForClass(AlertRule);

// Indexes
AlertRuleSchema.index({ orgId: 1, deviceId: 1, enabled: 1 });
AlertRuleSchema.index({ orgId: 1, enabled: 1 });
AlertRuleSchema.index({ createdBy: 1 });
