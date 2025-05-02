import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RogueGatewayDocument = RogueGateway & Document;

@Schema({ collection: 'rogueGateways', timestamps: true, _id: false })
export class RogueGateway {
  @Prop({ _id: true, type: String })
  _id: string;          // attempted ThingName

  @Prop({ required: true })
  mac: string;

  @Prop({ default: Date.now })
  firstSeen: Date;

  @Prop({ default: Date.now, index: true })
  lastAttempt: Date;

  @Prop({ default: 1 })
  attempts: number;

  @Prop()
  note?: string;
}

export const RogueGatewaySchema = SchemaFactory.createForClass(RogueGateway);
