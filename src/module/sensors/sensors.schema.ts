import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SensorType } from './enums/sensor.enum';

export type SensorDocument = Sensor & Document;

@Schema({ collection: 'sensors', timestamps: true, _id: false })
export class Sensor {
  @Prop({ _id: true, type: String })
  _id: string; // sensor MAC (PK)

  @Prop({ required: true, index: true })
  mac: string;

  /** Set only when user claims it */
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true,
  })
  orgId: Types.ObjectId | null;

  /** True once the probe is claimed (derived flag) */
  @Prop({ default: false })
  claimed: boolean;

  @Prop({ enum: SensorType })
  type?: SensorType;

  @Prop() unit?: string;

  // dashboard helpers
  @Prop() displayName?: string;
  @Prop() lastValue?: number;
  @Prop() lastUnit?: string;

  @Prop({ default: Date.now })
  firstSeen: Date;

  @Prop() lastSeen?: Date;

  @Prop({
    type: [String], // gwId list
    default: [],
  })
  lastSeenBy: string[];

  @Prop({ default: false })
  ignored: boolean;

  @Prop({ default: false })
  favorite: boolean;

  @Prop({default: false})
  isOnline: boolean;

  @Prop({ default: 0 })
  battery: number;
}

export const SensorSchema = SchemaFactory.createForClass(Sensor);

SensorSchema.index({ mac: 1 }, { unique: true });
SensorSchema.index({ mac: 'text', displayName: 'text' });