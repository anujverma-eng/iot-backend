import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  HttpCode,
  HttpStatus,
  HttpException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from './enums/users.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { InviteUserDto, MeDto, UpdateUserProfileDto, UpdateUserInfoDto } from './dto/user.dto';
import { MembershipsService } from '../memberships/memberships.service';
import { InvitesService } from '../invites/invites.service';
import { OrgContextUser } from '../../auth/org-context.guard';
import { computeEffectivePermissions, ALL_PERMISSIONS } from '../../common/constants/permissions';
import { PERMISSIONS } from '../../common/constants/permissions';
import { Public } from '../auth/public.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    private readonly invitesService: InvitesService,
  ) { }

  /**
   * Get all available permissions for UI rendering
   * Public endpoint - no authentication required
   */
  @Get('permissions/all')
  @Public()
  @HttpCode(HttpStatus.OK)
  getAllPermissions() {
    return {
      status: 'success',
      data: {
        // Full structured permissions object
        permissions: PERMISSIONS,

        // Flat array of all permission strings
        allPermissions: ALL_PERMISSIONS,

        // Organized by category for easy UI rendering
        categories: [
          {
            key: 'HOME',
            label: 'Home',
            description: 'Permissions for Home page features',
            permissions: Object.entries(PERMISSIONS.HOME).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'DASHBOARD',
            label: 'Dashboard',
            description: 'Permissions for Dashboard features',
            permissions: Object.entries(PERMISSIONS.DASHBOARD).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'SENSORS',
            label: 'Sensor Management',
            description: 'Permissions for managing sensors and sensor data',
            permissions: Object.entries(PERMISSIONS.SENSORS).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'GATEWAYS',
            label: 'Gateway Management',
            description: 'Permissions for managing gateways and gateway configuration',
            permissions: Object.entries(PERMISSIONS.GATEWAYS).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'TEAMS',
            label: 'Team & User Management',
            description: 'Permissions for team management and user settings',
            permissions: Object.entries(PERMISSIONS.TEAMS).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'INVITES',
            label: 'Invitations',
            description: 'Permissions for managing organization invitations',
            permissions: Object.entries(PERMISSIONS.INVITES).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          },
          {
            key: 'SETTINGS',
            label: 'Settings',
            description: 'Permissions for system and user settings',
            permissions: Object.entries(PERMISSIONS.SETTINGS).map(([key, value]) => ({
              key,
              value,
              label: key.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))
          }
        ]
      },
      message: 'All available permissions retrieved successfully'
    };
  }

  /**
   * Get simple list of all permission strings
   * Public endpoint - for basic dropdown/select usage
   */
  @Get('permissions/list')
  @Public()
  @HttpCode(HttpStatus.OK)
  getPermissionsList() {
    return {
      status: 'success',
      data: ALL_PERMISSIONS,
      message: 'Permission list retrieved successfully'
    };
  }

  /**
   * Get current user info with memberships and permissions
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: { user: OrgContextUser }) {
    try {
      const user = await this.usersService.findBySub(req.user.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's memberships
      const memberships = await this.membershipsService.getUserMemberships(req.user.userId);

      // Get pending invites count
      const pendingInvites = await this.invitesService.getUserPendingInvites(req.user.email);

      // Get current org context if available
      const currentOrg = req?.user?.orgId ? {
        orgId: req.user.orgId,
        role: req.user.role,
        permissions: req.user.permissions || [],
      } : null;

      return {
        user: {
          id: user._id,
          email: user.email,
          displayName: (user as any).displayName,
          fullName: user.fullName,
          companyName: user?.companyName,
          phoneNumber: user.phoneNumber,
          countryCode: user.countryCode,
          cognitoSub: user.cognitoSub,
          timezone: user?.timezone,
        },
        memberships: memberships.map(m => {
          const effectivePermissions = computeEffectivePermissions(
            m.role,
            m.allow || [],
            m.deny || []
          );

          return {
            orgId: m.orgId._id,
            orgName: (m.orgId as any).name,
            role: m.role,
            status: m.status,
            permissions: {
              allow: m.allow || [],
              deny: m.deny || [],
              effective: effectivePermissions
            }
          };
        }),
        currentOrg,
        pendingInvitesCount: pendingInvites.length,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get current user's permissions in organization context
   * Frontend should send X-Org-Id header or orgId query parameter
   */
  @Get('me/permissions')
  @UseGuards(JwtAuthGuard, OrgContextGuard)
  async getMyPermissions(@Req() req: { user: OrgContextUser }) {
    try {
      if (!req.user.orgId) {
        throw new HttpException(
          'Organization context required. Please provide X-Org-Id header or orgId query parameter',
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        status: 'success',
        data: {
          organizationId: req.user.orgId,
          role: req.user.role,
          permissions: req.user.permissions || []
        },
        message: `You have ${req.user.permissions?.length || 0} permissions in this organization`
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error fetching permissions', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update user profile
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: { user: OrgContextUser },
    @Body() dto: UpdateUserProfileDto
  ) {
    try {
      const updatedUser = await this.usersService.updateProfile(req.user.userId, dto);
      return {
        message: 'Profile updated successfully',
        user: {
          id: updatedUser?._id,
          email: updatedUser?.email,
          displayName: (updatedUser as any).displayName,
          fullName: updatedUser?.fullName,
          phoneNumber: updatedUser?.phoneNumber,
          countryCode: updatedUser?.countryCode,
          timezone: updatedUser?.timezone,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update user information (email, fullName, phoneNumber, countryCode)
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateUserInfo(
    @Req() req: { user: OrgContextUser },
    @Body() dto: UpdateUserInfoDto
  ) {
    try {
      const updatedUser = await this.usersService.updateUserInfo(req.user.userId, dto);
      return {
        message: 'User information updated successfully',
        data: {
          user: {
            id: updatedUser?._id,
            email: updatedUser?.email,
            fullName: updatedUser?.fullName,
            phoneNumber: updatedUser?.phoneNumber,
            countryCode: updatedUser?.countryCode,
            timezone: updatedUser?.timezone,
          },
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Confirm email change (after Cognito email verification)
   */
  @Post('me/email/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmEmailChange(@Req() req: { user: OrgContextUser }) {
    try {
      // Email comes from the JWT token after Cognito verification
      const newEmail = req.user.email;
      await this.usersService.updateEmail(req.user.userId, newEmail);

      return { message: 'Email updated successfully' };
    } catch (error) {
      throw error;
    }
  }

  /** Legacy invite endpoint (deprecated - use invites controller instead) */
  @Post('invite')
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.INVITES.CREATE)
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @Body() dto: InviteUserDto,
    @Req() req: { user: OrgContextUser }
  ) {
    // Redirect to new invites service
    return this.invitesService.createInvite(
      req.user.orgId!,
      req.user.userId,
      {
        email: dto.email,
        role: dto.role,
      }
    );
  }
}
