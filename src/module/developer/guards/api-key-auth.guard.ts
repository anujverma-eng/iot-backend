import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTokenService, TokenValidationResult } from '../api-token.service';

/**
 * Guard for Developer API endpoints
 * Validates API key from x-api-key header and attaches orgId to request
 * Also sets rate limit headers on response
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiTokenService: ApiTokenService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required. Provide x-api-key header.');
    }

    const validationResult: TokenValidationResult =
      await this.apiTokenService.validateToken(apiKey);

    if (!validationResult.isValid) {
      // Set rate limit headers even on failure (if available)
      if (validationResult.rateLimitInfo) {
        this.setRateLimitHeaders(response, validationResult.rateLimitInfo);
      }

      if (validationResult.error?.includes('Rate limit')) {
        throw new UnauthorizedException({
          statusCode: 429,
          message: validationResult.error,
          retryAfter: 60,
        });
      }

      throw new UnauthorizedException(validationResult.error || 'Invalid API key');
    }

    // Set rate limit headers
    if (validationResult.rateLimitInfo) {
      this.setRateLimitHeaders(response, validationResult.rateLimitInfo);
    }

    // Attach org context and token doc to request for downstream use
    (request as any).developerApi = {
      orgId: validationResult.orgId,
      tokenDoc: validationResult.tokenDoc,
    };

    return true;
  }

  private setRateLimitHeaders(
    response: Response,
    rateLimitInfo: NonNullable<TokenValidationResult['rateLimitInfo']>,
  ): void {
    response.setHeader('X-RateLimit-Limit-Minute', rateLimitInfo.limitPerMinute);
    response.setHeader('X-RateLimit-Remaining-Minute', rateLimitInfo.remainingMinute);
    response.setHeader('X-RateLimit-Limit-Day', rateLimitInfo.limitPerDay);
    response.setHeader('X-RateLimit-Remaining-Day', rateLimitInfo.remainingDay);
  }
}
