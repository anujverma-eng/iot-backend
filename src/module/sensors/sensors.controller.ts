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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequiredPermissions } from '../auth/permission.guard';
import { OrgContextGuard } from '../../auth/org-context.guard';
import { PERMISSIONS } from '../../common/constants/permissions';
import { SensorsService } from './sensors.service';
import { plainToInstance } from 'class-transformer';
import { ClaimSensorDto, SensorResponseDto } from './dto/sensor.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';
import { normLimit, normPage } from 'src/common/utils/pagination';
import { SensorType } from './enums/sensor.enum';
import { OrgContextUser } from '../../auth/org-context.guard';
import { ObjectId } from 'mongodb';

@Controller('sensors')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class SensorsController {
  constructor(private readonly svc: SensorsService) {}

  /** GET /sensors/by-gateway/:gatewayId */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  @Get('unclaimed')
  async getUnclaimedSensorsSeenByMyGateways(
    @Query() q: { page?: string; limit?: string, search?: string },
    @Req() req: { user: OrgContextUser },
  ) {
    const page = normPage(q);
    const limit = normLimit(q, 50);

    const { rows, total } = await this.svc.getUnclaimedSensorsSeenByMyGateways(
      new ObjectId(req.user.orgId!),
      { page, limit, search: q.search },
    );

    return {
      data: plainToInstance(SensorResponseDto, rows, {
        excludeExtraneousValues: true,
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

  }
  /** GET /sensors/by-gateway/:gatewayId */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  @Get('by-gateway/:gatewayId')
  async listByGateway(
    @Param('gatewayId') gatewayId: string,
    @Query() q: { page?: string; limit?: string; claimed?: string },
    @Req() req: { user: OrgContextUser },
  ) {
    const page = normPage(q);
    const limit = normLimit(q, 50);

    const { rows, total } = await this.svc.paginateByGateway(
      gatewayId,
      new ObjectId(req.user.orgId!),
      { page, limit, claimed: q.claimed },
    );

    return {
      data: plainToInstance(SensorResponseDto, rows, {
        excludeExtraneousValues: true,
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** GET /sensors   – all sensors in my organization (paginated) */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  @Get()
  async listAllMine(
    @Query()
    q: {
      page?: string;
      limit?: string;
      claimed?: string;
      q?: string; // search
      sort?: string; // field
      dir?: 'asc' | 'desc';
      type?: SensorType,
      favorite?: string,
    },
    @Req() req: any,
  ) {
    const page = normPage(q);
    const limit = normLimit(q, 50);

    const { rows, total } = await this.svc.getAllSensors(req.user.orgId, {
      page,
      limit,
      claimed: q.claimed,
      search: q.q,
      sort: q.sort,
      dir: q.dir,
      type: q?.type,
      favorite: q?.favorite,
    });

    return {
      // data: plainToInstance(SensorResponseDto, rows, {
      //   excludeExtraneousValues: true,
      // }),
      data: rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** POST /sensors/claim */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.ADD)
  @Post('claim')
  async claim(@Req() req: { user: OrgContextUser }, @Body() dto: ClaimSensorDto) {
    return this.svc.claimForUser(
      { orgId: new ObjectId(req.user.orgId!), role: req.user.role as UserRole },
      dto,
    );
  }

  /** GET /sensors/stats  – simple dashboard card */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  @Get('stats')
  getStats(@Req() req: { user: OrgContextUser }) {
    return this.svc.getStats(new ObjectId(req.user.orgId!));
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.VIEW)
  @Get(':mac')
  async getOne(@Param('mac') mac: string, @Req() req: { user: OrgContextUser }) {
    return this.svc.getDetails(mac.toUpperCase(), new ObjectId(req.user.orgId!));
  }

  /** PATCH /sensors/:mac – rename / toggle fields (currently label only) */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.UPDATE)
  @Patch(':mac')
  updateSensor(
    @Param('mac') mac: string,
    @Req() req: { user: OrgContextUser },
    @Body() dto: { displayName?: string, isOnline?: boolean },
  ) {
    return this.svc.updateSensor(mac.toUpperCase(), new ObjectId(req.user.orgId!), dto);
  }

  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.UPDATE)
  @Post(':mac/favorite')
  addToFavorite(
    @Param('mac') mac: string,
    @Req() req: { user: OrgContextUser },
  ) {
    return this.svc.addToFavorite(mac.toUpperCase(), new ObjectId(req.user.orgId!));
  }

  /** POST /sensors/:mac/claim   */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.ADD)
  @Post(':mac/claim')
  claimSensor(
    @Param('mac') mac: string,
    @Req() req: { user: OrgContextUser },
    @Body('displayName') displayName?: string,
  ) {
    return this.svc.claimForUser(
      { orgId: new ObjectId(req.user.orgId!), role: req.user.role as UserRole },
      { mac, displayName },
    );
  }

  /** POST /sensors/:mac/unclaim  */
  @UseGuards(PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.DELETE)
  @Post(':mac/unclaim')
  unclaimSensor(@Param('mac') mac: string, @Req() req: { user: OrgContextUser }) {
    return this.svc.unclaim(mac.toUpperCase(), new ObjectId(req.user.orgId!));
  }
}
