import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ collection: 'settings', timestamps: true })
export class Settings {
  @Prop({ required: true, min: 1 })
  sensorOfflineTimeOut: number; // in minutes

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
// SettingsSchema.index({ orgId: 1 });
