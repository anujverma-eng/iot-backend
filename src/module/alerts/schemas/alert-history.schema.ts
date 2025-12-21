import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertHistoryDocument = AlertHistory & Document;

export class NotificationRecord {
  @Prop({ required: true })
  channel: string; // 'email' or 'sms'

  @Prop({ required: true })
  recipient: string;

  @Prop({ required: true })
  success: boolean;

  @Prop()
  error?: string;

  @Prop({ required: true })
  timestamp: Date;
}

@Schema({ timestamps: true })
export class AlertHistory {
  @Prop({ type: Types.ObjectId, ref: 'AlertRule', required: true })
  ruleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true, enum: ['DEVICE_ONLINE','DEVICE_OFFLINE','LOW_BATTERY','DEVICE_OUT_OF_TOLERANCE'] })
  alertType: string;

  @Prop({ required: true })
  triggerTime: Date;

  @Prop()
  sensorValue?: number;

  @Prop()
  // Metric removed; telemetry is single-value per reading

  @Prop({ type: [NotificationRecord], required: true })
  notifications: NotificationRecord[];

  @Prop({ default: false })
  acknowledged: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acknowledgedBy?: Types.ObjectId;

  @Prop()
  acknowledgedAt?: Date;
}

export const AlertHistorySchema = SchemaFactory.createForClass(AlertHistory);

// Indexes
AlertHistorySchema.index({ ruleId: 1, triggerTime: -1 });
AlertHistorySchema.index({ orgId: 1, triggerTime: -1 });
AlertHistorySchema.index({ deviceId: 1, triggerTime: -1 });
