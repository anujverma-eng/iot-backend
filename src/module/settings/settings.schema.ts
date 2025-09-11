import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SettingsDocument = Settings & Document;
export type UserSettingsDocument = UserSettings & Document;

export enum OrgChoiceMode {
  REMEMBER = 'remember',
  ASK_EVERY_TIME = 'ask-every-time'
}

// Organization-level settings
@Schema({ collection: 'settings', timestamps: true })
export class Settings {
  @Prop({ required: true, min: 1 })
  sensorOfflineTimeOut: number; // in minutes

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;
}

// User-level settings
@Schema({ collection: 'user_settings', timestamps: true })
export class UserSettings {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  defaultOrgId?: Types.ObjectId;

  @Prop({ enum: OrgChoiceMode, default: OrgChoiceMode.REMEMBER })
  orgChoiceMode: OrgChoiceMode;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);

// Indexes
SettingsSchema.index({ orgId: 1 });
UserSettingsSchema.index({ userId: 1 }, { unique: true });
