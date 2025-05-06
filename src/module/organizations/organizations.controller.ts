import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { OrganizationsService } from './organizations.service';
import { UserRole } from '../users/enums/users.enum';
import { CreateOrganizationDto } from './dto/organization.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly svc: OrganizationsService) {}

  /** First‑time org creation */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  async create(@Body() dto: CreateOrganizationDto, @Req() req: any) {
    const org = await this.svc.createOrgAndSetOwner(req.user.userId, dto);
    return org;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: Request) {
    const { orgId } = (req as any).user ?? {};
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
}
