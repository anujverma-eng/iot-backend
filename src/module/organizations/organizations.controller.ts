import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { OrganizationsService } from './organizations.service';
import { UserRole } from '../users/enums/users.enum';
import { CreateOrganizationDto, UpdateOrganizationDto, UpdateOrganizationNameDto } from './dto/organization.dto';
import { Roles } from '../auth/roles.decorator';
import { OrgContextUser } from '../../auth/org-context.guard';
import { PERMISSIONS } from '../../common/constants/permissions';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly svc: OrganizationsService) {}

  /** First‑time org creation */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateOrganizationDto, 
    @Req() req: { user: OrgContextUser }
  ) {
    const org = await this.svc.createOrgAndSetOwner(
      req.user.userId as any,
      dto,
    );
    return org;
  }

  /** Get current user's organization info */
  @Get('me')
  @UseGuards(JwtAuthGuard, OrgContextGuard)
  async getMe(@Req() req: { user: OrgContextUser }) {
    const { orgId } = req.user;
    if (!orgId) throw new BadRequestException('You are not in an organization');

    const org = await this.svc.findByIdWithPlan(orgId) as any;

    return {
      _id: org._id,
      name: org.name,
      needsUpgrade: org.needsUpgrade,
      plan: {
        name: org.planId.name,
        maxGateways: org.planId.maxGateways,
        maxSensors: org.planId.maxSensors,
        maxUsers: org.planId.maxUsers,
        retentionDays: org.planId.retentionDays,
      },
      createdAt: org.createdAt,
    };
  }

  /** Rename organization */
  @Patch(':orgId')
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SETTINGS.RENAME_ORG)
  @HttpCode(HttpStatus.OK)
  async updateOrganization(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() req: { user: OrgContextUser }
  ) {
    // Verify user has permission for this specific org
    if (req.user.orgId !== orgId) {
      throw new BadRequestException('Organization ID mismatch');
    }

    const org = await this.svc.updateOrganization(orgId, dto);
    return {
      message: 'Organization updated successfully',
      organization: {
        id: org._id,
        name: org.name,
      },
    };
  }

  /** Update organization name */
  @Put(':orgId/name')
  @UseGuards(JwtAuthGuard, OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SETTINGS.RENAME_ORG)
  @HttpCode(HttpStatus.OK)
  async updateOrganizationName(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationNameDto,
    @Req() req: { user: OrgContextUser }
  ) {
    // Verify user has permission for this specific org
    if (req.user.orgId !== orgId) {
      throw new BadRequestException('Organization ID mismatch');
    }

    const org = await this.svc.updateOrganization(orgId, { name: dto.name });
    return {
      id: org._id,
      name: org.name,
      domain: org.domain,
      createdAt: (org as any).createdAt,
      updatedAt: (org as any).updatedAt,
    };
  }
}
