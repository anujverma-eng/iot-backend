import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { ApiToken, ApiTokenDocument } from './schemas/api-token.schema';
import {
  TOKEN_PREFIX,
  TOKEN_EXPIRY_DAYS,
  MAX_TOKENS_PER_ORG,
} from '../../common/constants/developer-api.constants';

export interface TokenValidationResult {
  isValid: boolean;
  orgId?: Types.ObjectId;
  tokenDoc?: ApiTokenDocument;
  error?: string;
  rateLimitInfo?: {
    limitPerMinute: number;
    remainingMinute: number;
    limitPerDay: number;
    remainingDay: number;
  };
}

export interface GeneratedTokenResponse {
  token: string;
  tokenPrefix: string;
  expiresAt: Date;
  name: string;
}

@Injectable()
export class ApiTokenService {
  private readonly logger = new Logger(ApiTokenService.name);

  constructor(
    @InjectModel(ApiToken.name)
    private readonly apiTokenModel: Model<ApiTokenDocument>,
  ) { }

  /**
   * Generate a new API token for an organization
   * Only one token allowed per organization
   * If a revoked/expired token exists from the same day, carry over rate limit counters
   * 
   * Edge cases handled:
   * 1. User revokes and regenerates same day → carry over day count
   * 2. Token expires same day user regenerates → carry over day count if used today
   * 3. Token expires, user regenerates next day → fresh limits (new day)
   * 4. First time generation → fresh limits
   */
  async generateToken(
    orgId: Types.ObjectId,
    userId: Types.ObjectId,
    name?: string,
  ): Promise<GeneratedTokenResponse> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Check if org already has an active (non-revoked) token
    const existingToken = await this.apiTokenModel.findOne({
      orgId,
      isRevoked: false,
    });

    if (existingToken) {
      // Check if it's NOT expired (still active)
      if (existingToken.expiresAt > now) {
        throw new ConflictException(
          'Organization already has an active API token. Please revoke the existing token before generating a new one.',
        );
      }
      // Token is expired - mark as revoked to preserve history
      await this.apiTokenModel.updateOne(
        { _id: existingToken._id },
        { $set: { isRevoked: true } },
      );
    }

    // Find any revoked token for this org to potentially carry over rate limits
    // We need to check if it was used TODAY (based on lastDayReset)
    const revokedToken = await this.apiTokenModel.findOne({
      orgId,
      isRevoked: true,
    }).sort({ updatedAt: -1 }); // Get most recently revoked token

    // Determine rate limits to carry over
    // Only carry over if the revoked token's lastDayReset is TODAY
    let currentDayCount = 0;
    let lastDayReset = startOfDay;
    let totalSuccessfulCalls = 0;

    if (revokedToken) {
      // Check if the revoked token was used today (lastDayReset >= startOfDay)
      const tokenLastDayReset = revokedToken.lastDayReset;
      const wasUsedToday = tokenLastDayReset && tokenLastDayReset >= startOfDay;

      if (wasUsedToday) {
        // Carry over today's usage
        currentDayCount = revokedToken.currentDayCount || 0;
        lastDayReset = tokenLastDayReset;
        this.logger.log(`Carrying over rate limits from revoked token: ${currentDayCount} calls used today`);
      }

      // Always carry over lifetime total (for analytics)
      totalSuccessfulCalls = revokedToken.totalSuccessfulCalls || 0;
    }

    // Generate random token (32 bytes = 64 hex chars)
    const rawToken = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
    const tokenPrefix = rawToken.substring(0, 12); // mtnc_ + 7 chars

    // Hash the token for storage
    const saltRounds = 10;
    const tokenHash = await bcrypt.hash(rawToken, saltRounds);

    // Calculate expiry date
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

    const tokenName = name || 'Default API Key';

    // Delete old revoked tokens for this org (cleanup)
    await this.apiTokenModel.deleteMany({ orgId, isRevoked: true });

    // Create new token with carried-over counters
    await this.apiTokenModel.create({
      orgId,
      createdByUserId: userId,
      name: tokenName,
      tokenHash,
      tokenPrefix,
      expiresAt,
      isRevoked: false,
      lastUsedAt: null,
      currentMinuteCount: 0, // Minute counter always resets with new token
      currentDayCount, // Carry over from revoked token if same day
      lastMinuteReset: now,
      lastDayReset, // Carry over from revoked token if same day
      totalSuccessfulCalls, // Carry over lifetime count for analytics
    });

    this.logger.log(`Generated new API token for org ${orgId} (day count: ${currentDayCount}, lifetime: ${totalSuccessfulCalls})`);

    // Return raw token ONLY ONCE - it won't be recoverable after this
    return {
      token: rawToken,
      tokenPrefix,
      expiresAt,
      name: tokenName,
    };
  }

  /**
   * Validate an API token and check rate limits
   * Returns organization ID if valid
   */
  async validateToken(rawToken: string): Promise<TokenValidationResult> {
    if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) {
      return { isValid: false, error: 'Invalid token format' };
    }

    const tokenPrefix = rawToken.substring(0, 12);

    // Find potential matching tokens by prefix
    const tokenDoc = await this.apiTokenModel.findOne({
      tokenPrefix,
      isRevoked: false,
    });

    if (!tokenDoc) {
      return { isValid: false, error: 'Token not found or revoked' };
    }

    // Check expiry
    if (tokenDoc.expiresAt < new Date()) {
      return { isValid: false, error: 'Token has expired' };
    }

    // Verify token hash
    const isMatch = await bcrypt.compare(rawToken, tokenDoc.tokenHash);
    if (!isMatch) {
      return { isValid: false, error: 'Invalid token' };
    }

    // Check rate limits
    const now = new Date();
    const rateLimitResult = await this.checkAndUpdateRateLimits(tokenDoc, now);

    if (!rateLimitResult.allowed) {
      return {
        isValid: false,
        error: rateLimitResult.error,
        rateLimitInfo: {
          limitPerMinute: tokenDoc.rateLimitPerMinute,
          remainingMinute: 0,
          limitPerDay: tokenDoc.rateLimitPerDay,
          remainingDay: rateLimitResult.remainingDay,
        },
      };
    }

    return {
      isValid: true,
      orgId: tokenDoc.orgId,
      tokenDoc,
      rateLimitInfo: {
        limitPerMinute: tokenDoc.rateLimitPerMinute,
        remainingMinute: rateLimitResult.remainingMinute,
        limitPerDay: tokenDoc.rateLimitPerDay,
        remainingDay: rateLimitResult.remainingDay,
      },
    };
  }

  /**
   * Check rate limits and update counters
   * Only increments counters - actual success tracking done via recordSuccessfulCall
   */
  private async checkAndUpdateRateLimits(
    tokenDoc: ApiTokenDocument,
    now: Date,
  ): Promise<{
    allowed: boolean;
    error?: string;
    remainingMinute: number;
    remainingDay: number;
  }> {
    const startOfMinute = new Date(now);
    startOfMinute.setSeconds(0, 0);

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    let currentMinuteCount = tokenDoc.currentMinuteCount || 0;
    let currentDayCount = tokenDoc.currentDayCount || 0;

    // Reset minute counter if new minute
    if (!tokenDoc.lastMinuteReset || tokenDoc.lastMinuteReset < startOfMinute) {
      currentMinuteCount = 0;
    }

    // Reset day counter if new day
    if (!tokenDoc.lastDayReset || tokenDoc.lastDayReset < startOfDay) {
      currentDayCount = 0;
    }

    // Check minute limit
    if (currentMinuteCount >= tokenDoc.rateLimitPerMinute) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${tokenDoc.rateLimitPerMinute} requests per minute`,
        remainingMinute: 0,
        remainingDay: tokenDoc.rateLimitPerDay - currentDayCount,
      };
    }

    // Check day limit
    if (currentDayCount >= tokenDoc.rateLimitPerDay) {
      return {
        allowed: false,
        error: `Daily rate limit exceeded: ${tokenDoc.rateLimitPerDay} requests per day`,
        remainingMinute: tokenDoc.rateLimitPerMinute - currentMinuteCount,
        remainingDay: 0,
      };
    }

    return {
      allowed: true,
      remainingMinute: tokenDoc.rateLimitPerMinute - currentMinuteCount - 1,
      remainingDay: tokenDoc.rateLimitPerDay - currentDayCount - 1,
    };
  }

  /**
   * Record a successful API call (increment counters)
   * Called after successful response
   */
  async recordSuccessfulCall(tokenId: Types.ObjectId): Promise<void> {
    const now = new Date();
    const startOfMinute = new Date(now);
    startOfMinute.setSeconds(0, 0);

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Atomic update with conditional resets
    await this.apiTokenModel.updateOne(
      { _id: tokenId },
      [
        {
          $set: {
            lastUsedAt: now,
            // Reset minute counter if new minute, then increment
            currentMinuteCount: {
              $cond: {
                if: { $lt: ['$lastMinuteReset', startOfMinute] },
                then: 1,
                else: { $add: ['$currentMinuteCount', 1] },
              },
            },
            lastMinuteReset: {
              $cond: {
                if: { $lt: ['$lastMinuteReset', startOfMinute] },
                then: startOfMinute,
                else: '$lastMinuteReset',
              },
            },
            // Reset day counter if new day, then increment
            currentDayCount: {
              $cond: {
                if: { $lt: ['$lastDayReset', startOfDay] },
                then: 1,
                else: { $add: ['$currentDayCount', 1] },
              },
            },
            lastDayReset: {
              $cond: {
                if: { $lt: ['$lastDayReset', startOfDay] },
                then: startOfDay,
                else: '$lastDayReset',
              },
            },
            totalSuccessfulCalls: { $add: ['$totalSuccessfulCalls', 1] },
          },
        },
      ],
    );
  }

  /**
   * Get token info for an organization (for display)
   */
  async getTokenInfo(orgId: Types.ObjectId): Promise<{
    exists: boolean;
    token?: {
      id: string;
      name: string;
      tokenPrefix: string;
      expiresAt: Date;
      createdAt: Date;
      lastUsedAt?: Date;
      isExpired: boolean;
      rateLimitPerMinute: number;
      rateLimitPerDay: number;
      currentDayCount: number;
      totalSuccessfulCalls: number;
    };
  }> {
    const tokenDoc = await this.apiTokenModel.findOne({
      orgId,
      isRevoked: false,
    });

    if (!tokenDoc) {
      return { exists: false };
    }

    return {
      exists: true,
      token: {
        id: (tokenDoc as any)._id.toString(),
        name: tokenDoc.name,
        tokenPrefix: tokenDoc.tokenPrefix,
        expiresAt: tokenDoc.expiresAt,
        createdAt: tokenDoc.createdAt!,
        lastUsedAt: tokenDoc.lastUsedAt,
        isExpired: tokenDoc.expiresAt < new Date(),
        rateLimitPerMinute: tokenDoc.rateLimitPerMinute,
        rateLimitPerDay: tokenDoc.rateLimitPerDay,
        currentDayCount: tokenDoc.currentDayCount || 0,
        totalSuccessfulCalls: tokenDoc.totalSuccessfulCalls || 0,
      },
    };
  }

  /**
   * Revoke an organization's token
   * Marks as revoked instead of deleting to preserve rate limit counters
   */
  async revokeToken(orgId: Types.ObjectId): Promise<void> {
    const result = await this.apiTokenModel.updateOne(
      { orgId, isRevoked: false },
      { $set: { isRevoked: true } },
    );

    if (result.matchedCount === 0) {
      throw new BadRequestException('No active token found for this organization');
    }

    this.logger.log(`Revoked API token for org ${orgId}`);
  }

  /**
   * Cleanup expired tokens (can be called by cron job)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.apiTokenModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    if (result.deletedCount > 0) {
      this.logger.log(`Cleaned up ${result.deletedCount} expired tokens`);
    }

    return result.deletedCount;
  }
}
