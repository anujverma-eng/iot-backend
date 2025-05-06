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

  @Prop()
  displayName?: string;

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

  @Prop()
  lastLogin?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ orgId: 1, email: 1 }, { unique: true });
