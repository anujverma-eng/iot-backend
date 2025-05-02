import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationKind } from './enums/notification.enum';

export type NotificationDocument = Notification & Document;

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  orgId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  recipientUserId?: Types.ObjectId;   // optional

  @Prop({
    enum: NotificationKind,
    required: true,
  })
  kind: NotificationKind;

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ orgId: 1, createdAt: -1 });
