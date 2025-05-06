import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { GatewayStatus } from './enums/gateway.enum';

export type GatewayDocument = Gateway & Document;

@Schema({ collection: 'gateways', timestamps: true, _id: false })
export class Gateway {
  @Prop({ _id: true, type: String })
  _id: string; // gatewayId / ThingName

  @Prop({ required: true, unique: true })
  mac: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true,
  })
  orgId: Types.ObjectId | null;

  @Prop({ required: true })
  certId: string;

  @Prop({
    enum: GatewayStatus,
    default: GatewayStatus.UNCLAIMED,
  })
  status: GatewayStatus;

  // optional / future
  @Prop()
  claimCode?: string;

  @Prop()
  firmwareVersion?: string;

  @Prop({
    type: Object,
  })
  location?: {
    lat: number;
    lng: number;
  };

  @Prop()
  lastSeen?: Date;

  @Prop()
  certPem?: string;

  @Prop()
  keyPem?: string;

  @Prop()
  caPem?: string;

  /** S3 key inside iot‑cert‑packs bucket */
  @Prop()
  packS3Key?: string;
}

export const GatewaySchema = SchemaFactory.createForClass(Gateway);

GatewaySchema.index({ orgId: 1 });
