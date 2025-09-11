import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../users/enums/users.enum';

export type InviteDocument = Invite & Document;

export enum InviteStatus {
  CREATED = 'CREATED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  BOUNCED = 'BOUNCED',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  DECLINED = 'DECLINED'
}

@Schema({ collection: 'invites', timestamps: true })
export class Invite {
  @Prop({ required: true })
  email: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ type: [String], default: [] })
  allow: string[];

  @Prop({ type: [String], default: [] })
  deny: string[];

  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ enum: InviteStatus, default: InviteStatus.CREATED })
  status: InviteStatus;

  @Prop()
  lastEmailMessageId?: string;

  @Prop()
  deliveryAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acceptedBy?: Types.ObjectId;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  declinedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);

// Indexes
InviteSchema.index({ orgId: 1, email: 1 });
InviteSchema.index({ token: 1 }, { unique: true });
InviteSchema.index({ email: 1, status: 1 });
InviteSchema.index({ expiresAt: 1 });
