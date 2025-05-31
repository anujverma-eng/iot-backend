// src/module/telemetry/telemetry.schema.ts
import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TelemetryDocument = Telemetry & Document;

@Schema({ collection: 'telemetry', timestamps: false, _id: false })
export class Telemetry {
  @Prop({ required: true, type: Date, index: true })
  ts: Date; // measurement timestamp

  @Prop({ required: true, type: String, index: true })
  sensorId: string; // gw#mac

  @Prop({ required: false, type: String })
  name: string; // gw#mac

  @Prop({ required: true })
  value: number;
}

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);
TelemetrySchema.index({ sensorId: 1, ts: -1 });
