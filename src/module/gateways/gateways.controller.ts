import {
  Body,
  Controller,
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
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/users.enum';
import {
  BulkGatewaysDto,
  CreateGatewayAdminDto,
  RegisterGatewayDto,
} from './dto/gateway.dto';
import { GatewaysService } from './gateways.service';

@Controller('gateways')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GatewaysController {
  constructor(private readonly gwSvc: GatewaysService) {}

  // @Roles(UserRole.ADMIN)
  @Public()
  @Post('admin/create-one')
  createOne(@Body() dto: CreateGatewayAdminDto) {
    return this.gwSvc.adminCreateOne(dto.mac);
  }

  // @Roles(UserRole.ADMIN)
  @Public()
  @Post('admin/bulk')
  async adminBulkCreate(@Body() dto: BulkGatewaysDto) {
    return this.gwSvc.adminCreateBulk(dto.macs);
  }

  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @Post('register')
  async register(@Req() req: any, @Body() dto: RegisterGatewayDto) {
    return this.gwSvc.registerForOrg(req.user.orgId, dto);
  }

  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  @Get()
  async listMine(
    @Req() req: any,
    @Query() q: { page?: string; limit?: string },
  ) {
    const page = normPage(q);
    const limit = normLimit(q);

    const { rows, total } = await this.gwSvc.listForOrg(req.user.orgId, {
      page,
      limit,
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

  @Get('stats')
  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  getStats(@Req() req: any) {
    return this.gwSvc.getStats(req.user.orgId);
  }

  @Get(':id/sensors')
  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  async sensorsForGateway(
    @Param('id') id: string,
    @Req() req: any,
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
      req.user.orgId,
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

  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.gwSvc.getDetails(id, req.user.orgId);
  }

  @Patch(':id')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: { label?: string },
  ) {
    return this.gwSvc.updateLabel(id, req.user.orgId, dto.label);
  }

  @Post(':id/sensors')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  addSensorsToGateway(
    @Param('id') id: string,
    @Body('macs') macs: string[],
    @Req() req: any,
  ) {
    return this.gwSvc.attachSensors(id, req.user.orgId, macs);
  }
}
