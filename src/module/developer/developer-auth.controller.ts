import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard, OrgContextUser } from '../../auth/org-context.guard';
import { ApiTokenService } from './api-token.service';
import { DEVELOPER_API_BASE_PATH } from '../../common/constants/developer-api.constants';
import { Types } from 'mongoose';

/**
 * API Token Management Controller
 * Requires Cognito authentication for token lifecycle management
 */
@Controller(`${DEVELOPER_API_BASE_PATH}/tokens`)
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class DeveloperAuthController {
  constructor(private readonly apiTokenService: ApiTokenService) { }

  /**
   * Generate a new API token for the organization
   * Only one token per organization is allowed
   */
  @Post()
  async generateToken(
    @Req() req: { user: OrgContextUser },
    @Body() body: { name?: string },
  ) {
    const result = await this.apiTokenService.generateToken(
      new Types.ObjectId(req.user.orgId),
      new Types.ObjectId(req.user.userId),
      body.name,
    );

    return {
      success: true,
      message: 'API token generated successfully. Save this token securely - it will not be shown again.',
      data: result,
    };
  }

  /**
   * Get current token info and usage statistics
   */
  @Get()
  async getTokenInfo(@Req() req: { user: OrgContextUser }) {
    const result = await this.apiTokenService.getTokenInfo(
      new Types.ObjectId(req.user.orgId),
    );

    if (!result.exists) {
      return {
        success: true,
        exists: false,
        message: 'No API token exists for this organization. Generate one to get started.',
      };
    }

    return {
      success: true,
      exists: true,
      data: result.token,
    };
  }

  /**
   * Revoke the current API token
   * Anyone in the organization can revoke the token
   */
  @Delete()
  async revokeToken(@Req() req: { user: OrgContextUser }) {
    await this.apiTokenService.revokeToken(
      new Types.ObjectId(req.user.orgId),
    );

    return {
      success: true,
      message: 'API token revoked successfully. Generate a new token to continue using the Developer API.',
    };
  }
}
