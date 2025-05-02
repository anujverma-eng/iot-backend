import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SensorType } from './enums/sensor.enum';

export type SensorDocument = Sensor & Document;

@Schema({ collection: 'sensors', timestamps: true, _id: false })
export class Sensor {
  @Prop({ _id: true, type: String })
  _id: string; // gatewayId#sensorMac

  @Prop({ required: true, index: true })
  mac: string;

  @Prop({ required: true })
  gatewayId: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  orgId: Types.ObjectId;

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

  @Prop({ default: false })
  ignored: boolean;
}

export const SensorSchema = SchemaFactory.createForClass(Sensor);

// quick look‑up before composing _id
SensorSchema.index({ gatewayId: 1, mac: 1 }, { unique: true });
