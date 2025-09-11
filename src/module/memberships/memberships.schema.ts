import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../users/enums/users.enum';

export type MembershipDocument = Membership & Document;

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  SUSPENDED = 'SUSPENDED',
}

@Schema({ collection: 'memberships', timestamps: true })
export class Membership {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ type: [String], default: [] })
  allow: string[];

  @Prop({ type: [String], default: [] })
  deny: string[];

  @Prop({ enum: MembershipStatus, default: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId;

  @Prop()
  invitedAt?: Date;

  @Prop()
  acceptedAt?: Date;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);

// Indexes
MembershipSchema.index({ userId: 1, orgId: 1 }, { unique: true });
MembershipSchema.index({ orgId: 1, status: 1 });
MembershipSchema.index({ userId: 1, status: 1 });
