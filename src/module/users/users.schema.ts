
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole, UserStatus } from './enums/users.enum';

export type UserDocument = User & Document;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: false,
  })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({ required: false })
  fullName?: string;

  @Prop({ required: false })
  phoneNumber?: string;

  @Prop({ required: false })
  countryCode?: string;

  @Prop({ required: false })
  cognitoSub?: string;

  @Prop({
    enum: UserRole,
    default: UserRole.MEMBER,
  })
  role: UserRole;

  @Prop({
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Prop({ required: false })
  companyName?: string;

  @Prop({ required: false })
  timezone?: string; // IANA timezone string (e.g., 'Asia/Kolkata', 'America/New_York')
}

export const UserSchema = SchemaFactory.createForClass(User);

// Unique index on email only (multi-org support)
UserSchema.index({ email: 1 }, { unique: true });
// Keep orgId field for backward compatibility but don't index with email
UserSchema.index({ orgId: 1 });
