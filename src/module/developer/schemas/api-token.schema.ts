import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_RATE_LIMIT_PER_DAY,
} from '../../../common/constants/developer-api.constants';

export type ApiTokenDocument = ApiToken & Document;

@Schema({ collection: 'api_tokens', timestamps: true })
export class ApiToken {
  /** Organization this token belongs to (unique - one token per org) */
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true })
  orgId: Types.ObjectId;

  /** User who created/regenerated this token */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId: Types.ObjectId;

  /** Optional label/name for the token */
  @Prop({ type: String, default: 'Default API Key' })
  name: string;

  /** bcrypt-hashed token value (raw token is never stored) */
  @Prop({ type: String, required: true })
  tokenHash: string;

  /** First 12 chars of token for display identification (e.g., "mtnc_abc123") */
  @Prop({ type: String, required: true, index: true })
  tokenPrefix: string;

  /** Token expiry date (15 days from creation) */
  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  /** Last time this token was used successfully */
  @Prop({ type: Date })
  lastUsedAt?: Date;

  /** Whether token has been manually revoked */
  @Prop({ type: Boolean, default: false })
  isRevoked: boolean;

  // ============ Rate Limiting Fields ============

  /** Max requests allowed per minute (configurable for future paid tiers) */
  @Prop({ type: Number, default: DEFAULT_RATE_LIMIT_PER_MINUTE })
  rateLimitPerMinute: number;

  /** Max requests allowed per day (configurable for future paid tiers) */
  @Prop({ type: Number, default: DEFAULT_RATE_LIMIT_PER_DAY })
  rateLimitPerDay: number;

  /** Current request count for the current minute window */
  @Prop({ type: Number, default: 0 })
  currentMinuteCount: number;

  /** Current request count for the current day */
  @Prop({ type: Number, default: 0 })
  currentDayCount: number;

  /** Timestamp when the minute counter was last reset */
  @Prop({ type: Date })
  lastMinuteReset?: Date;

  /** Timestamp when the day counter was last reset (start of day UTC) */
  @Prop({ type: Date })
  lastDayReset?: Date;

  // ============ Analytics Fields ============

  /** Total successful API calls made with this token (lifetime) */
  @Prop({ type: Number, default: 0 })
  totalSuccessfulCalls: number;

  /** Mongoose timestamps */
  createdAt?: Date;
  updatedAt?: Date;
}

export const ApiTokenSchema = SchemaFactory.createForClass(ApiToken);

// Ensure only one active token per organization
ApiTokenSchema.index({ orgId: 1 }, { unique: true });
