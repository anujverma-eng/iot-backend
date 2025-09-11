import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequiredPermissions } from '../auth/permission.guard';
import { PERMISSIONS } from '../../common/constants/permissions';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { UserRole } from '../users/enums/users.enum';
import { InvitesService } from './invites.service';
import { CreateInviteDto, InviteListQueryDto, BulkCreateInviteDto } from './dto/invite.dto';
import { OrgContextUser } from '../../auth/org-context.guard';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * Create invite (org-scoped)
   */
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.INVITES.CREATE)
  @Post('organizations/:orgId/invites')
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Param('orgId') orgId: string,
    @Req() req: { user: OrgContextUser },
    @Body() dto: CreateInviteDto
  ) {
    try {
      const invite = await this.invitesService.createInvite(
        orgId,
        req.user.userId,
        dto
      );

      return invite;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create bulk invites (org-scoped)
   */
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.INVITES.CREATE)
  @Post('organizations/:orgId/invites/bulk')
  @HttpCode(HttpStatus.CREATED)
  async createBulkInvites(
    @Param('orgId') orgId: string,
    @Req() req: { user: OrgContextUser },
    @Body() dto: BulkCreateInviteDto
  ) {
    try {
      const result = await this.invitesService.createBulkInvites(
        orgId,
        req.user.userId,
        dto
      );

      return {
        message: `Bulk invite completed. ${result.successful.length} successful, ${result.failed.length} failed.`,
        ...result,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * List invites for organization
   */
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.INVITES.VIEW)
  @Get('organizations/:orgId/invites')
  async getInvites(
    @Param('orgId') orgId: string,
    @Query() query: InviteListQueryDto
  ) {
    try {
      const options = {
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        status: query.status || [],
      };

      return await this.invitesService.getOrgInvites(orgId, options);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Revoke invite
   */
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.INVITES.REVOKE)
  @Delete('organizations/:orgId/invites/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @Param('orgId') orgId: string,
    @Param('token') token: string
  ) {
    try {
      await this.invitesService.revokeInvite(token, orgId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get invite info (public)
   */
  @Get('invites/:token')
  @Public()
  async getInviteInfo(@Param('token') token: string) {
    try {
      return await this.invitesService.getInviteByToken(token);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Accept invite
   */
  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param('token') token: string,
    @Req() req: { user: OrgContextUser }
  ) {
    try {
      const membership = await this.invitesService.acceptInvite(token, req.user.userId);
      return {
        ...membership
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Decline invite
   */
  @Post('invites/:token/decline')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async declineInvite(
    @Param('token') token: string,
    @Req() req: { user: OrgContextUser }
  ) {
    try {
      await this.invitesService.declineInvite(token, req.user.userId);
      return { message: 'Invitation declined' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user's pending invites
   */
  @Get('me/invites')
  @UseGuards(JwtAuthGuard)
  async getMyInvites(@Req() req: { user: OrgContextUser }) {
    try {
      const invites = await this.invitesService.getUserPendingInvites(req.user.email);
      return { invites };
    } catch (error) {
      throw error;
    }
  }
}
