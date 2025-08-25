import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  domain?: string;

  @Prop({ type: Types.ObjectId, ref: 'Plan', required: true })
  planId: Types.ObjectId;

  @Prop({ default: false })
  needsUpgrade: boolean;

  @Prop() planActivatedAt?: Date;

  @Prop() planExpiresAt?: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ domain: 1 });
