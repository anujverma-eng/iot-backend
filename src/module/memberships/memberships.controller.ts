import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { UserRole } from '../users/enums/users.enum';
import { PERMISSIONS, RoleBaselines } from '../../common/constants/permissions';
import { MembershipsService } from './memberships.service';
import { OrgContextUser } from '../../auth/org-context.guard';
import {
  UpdateMembershipRoleDto,
  UpdateMembershipPermissionsDto,
  UpdateMembershipDto,
  PaginationQueryDto,
} from './dto/membership.dto';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';

@Controller('organizations/:orgId/members')
@UseGuards(JwtAuthGuard, OrgContextGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Get members of an organization
   */
  @Get()
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.TEAMS.VIEW_MEMBERS)
  async getMembers(
    @Param('orgId') orgId: string,
    @Query() query: PaginationQueryDto,
  ) {
    try {
      const options = {
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        search: query.search || '',
        sort: query.sort || 'createdAt',
        dir: query.dir || ('desc' as 'asc' | 'desc'),
      };

      return await this.membershipsService.getOrgMembers(orgId, options);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update member role
   */
  @Patch(':membershipId/role')
    @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.TEAMS.MANAGE_ROLES)
  @HttpCode(HttpStatus.OK)
  async updateRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMembershipRoleDto,
  ) {
    try {
      const membership = await this.membershipsService.updateRole(
        membershipId,
        dto,
      );
      return {
        id: (membership as any)._id,
        role: membership.role,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update member permissions
   */
  @Patch(':membershipId/permissions')
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.TEAMS.MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  async updatePermissions(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMembershipPermissionsDto,
  ) {
    try {
      const membership = await this.membershipsService.updatePermissions(
        membershipId,
        dto,
      );
      return {
        id: (membership as any)._id,
        allow: membership.allow,
        deny: membership.deny,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update member role and permissions together
   */
  @Patch(':membershipId')
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.TEAMS.MANAGE_ROLES, PERMISSIONS.TEAMS.MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  async updateMembership(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    try {
      const membership = await this.membershipsService.updateMembership(
        membershipId,
        dto,
      );
      return {
        message: 'Member updated successfully',
        membership: {
          id: (membership as any)._id,
          role: membership.role,
          allow: membership.allow,
          deny: membership.deny,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove member from organization
   */
  @Delete(':membershipId')
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.TEAMS.REMOVE_MEMBERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('membershipId') membershipId: string,
    @Req() req: { user: OrgContextUser },
  ) {
    try {
      await this.membershipsService.removeMember(membershipId, req.user.userId);
    } catch (error) {
      throw error;
    }
  }
}

// Separate controller for public routes
@Controller('members')
export class PublicMembersController {
  constructor() {}

  /**
   * Get default permissions for each member role type
   * This is a public endpoint to help frontend display role information
   */
  @Get('roles/permissions')
  @Public()
  async getRolePermissions() {
    return {
      success: true,
      data: {
        roles: {
          [UserRole.OWNER]: {
            name: 'Owner',
            description: 'Full access to all organization features and settings',
            permissions: RoleBaselines[UserRole.OWNER],
            permissionCount: RoleBaselines[UserRole.OWNER].length,
          },
          [UserRole.ADMIN]: {
            name: 'Admin',
            description: 'Manage organization settings and members, but cannot delete the organization',
            permissions: RoleBaselines[UserRole.ADMIN],
            permissionCount: RoleBaselines[UserRole.ADMIN].length,
          },
          [UserRole.MEMBER]: {
            name: 'Member',
            description: 'Create and manage own sensors, view organization data',
            permissions: RoleBaselines[UserRole.MEMBER],
            permissionCount: RoleBaselines[UserRole.MEMBER].length,
          },
          [UserRole.VIEWER]: {
            name: 'Viewer',
            description: 'Read-only access to organization data',
            permissions: RoleBaselines[UserRole.VIEWER],
            permissionCount: RoleBaselines[UserRole.VIEWER].length,
          },
        },
        totalRoles: 4,
      },
    };
  }
}
