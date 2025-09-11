import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { normLimit, normPage } from 'src/common/utils/pagination';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequiredPermissions } from '../auth/permission.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { PERMISSIONS } from '../../common/constants/permissions';
import { OrgContextUser } from '../../auth/org-context.guard';
import { UserRole } from '../users/enums/users.enum';
import {
  BulkGatewaysDto,
  CreateGatewayAdminDto,
  RegisterGatewayDto,
} from './dto/gateway.dto';
import { GatewaysService } from './gateways.service';
import { ObjectId } from 'mongodb';

@Controller('gateways')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class GatewaysController {
  constructor(private readonly gwSvc: GatewaysService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('admin/create-one')
  createOne(@Body() dto: CreateGatewayAdminDto) {
    return this.gwSvc.adminCreateOne(dto.mac);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('admin/bulk')
  async adminBulkCreate(@Body() dto: BulkGatewaysDto) {
    return this.gwSvc.adminCreateBulk(dto.macs);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.ADD)
  @Post('register')
  async register(@Req() req: { user: OrgContextUser }, @Body() dto: RegisterGatewayDto) {
    return this.gwSvc.registerForOrg(req.user.orgId!, dto);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.VIEW)
  @Get()
  async listMine(
    @Req() req: { user: OrgContextUser },
    @Query() q: { page?: string; limit?: string, search?: string },
  ) {
    const page = normPage(q);
    const limit = normLimit(q);

    const { rows, total } = await this.gwSvc.listForOrg(req.user.orgId!, {
      page,
      limit,
      search: q.search,
    });

    return {
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.VIEW)
  @Get('stats')
  getStats(@Req() req: { user: OrgContextUser }) {
    return this.gwSvc.getStats(req.user.orgId!);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.DETAILS)
  @Get(':id/sensors')
  async sensorsForGateway(
    @Param('id') id: string,
    @Req() req: { user: OrgContextUser },
    @Query()
    q: {
      claimed?: string;
      page?: string;
      limit?: string;
      search?: string;
      sort?: string;
      dir?: 'asc' | 'desc';
    },
  ) {
    const page = normPage(q);
    const limit = normLimit(q, 50);
    const { rows, total } = await this.gwSvc.sensorsForGateway(
      id,
      req.user.orgId!,
      {
        page,
        limit,
        claimed: q.claimed,
        search: q.search,
        sort: q.sort,
        dir: q.dir,
      },
    );
    return {
      data: rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.DETAILS)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: { user: OrgContextUser }) {
    return this.gwSvc.getDetails(id, req.user.orgId!);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: { user: OrgContextUser },
    @Body() dto: { label?: string; location?: string },
  ) {
    return this.gwSvc.updateGateway(id, req.user.orgId!, dto);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.UPDATE)
  @Post(':id/sensors')
  addSensorsToGateway(
    @Param('id') id: string,
    @Body('macs') macs: string[],
    @Req() req: { user: OrgContextUser },
  ) {
    return this.gwSvc.attachSensors(id, req.user.orgId!, macs);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.GATEWAYS.DELETE)
  @Delete(':id')
  async deleteGateway(
    @Param('id') id: string,
    @Req() req: { user: OrgContextUser },
  ) {
    return this.gwSvc.deleteGateway(id, req.user.orgId!);
  }
}
