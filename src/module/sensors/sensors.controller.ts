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
import { SensorsService } from './sensors.service';
import { plainToInstance } from 'class-transformer';
import { ClaimSensorDto, SensorResponseDto } from './dto/sensor.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';
import { normLimit, normPage } from 'src/common/utils/pagination';
import { SensorType } from './enums/sensor.enum';

@Controller('sensors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SensorsController {
  constructor(private readonly svc: SensorsService) {}

  /** GET /sensors/by-gateway/:gatewayId */
  @Roles(UserRole.OWNER)
  @Get('by-gateway/:gatewayId')
  async listByGateway(
    @Param('gatewayId') gatewayId: string,
    @Query() q: { page?: string; limit?: string; claimed?: string },
    @Req() req: any,
  ) {
    const page = normPage(q);
    const limit = normLimit(q, 50);

    const { rows, total } = await this.svc.paginateByGateway(
      gatewayId,
      req.user.orgId,
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
  @Get()
  @Roles(UserRole.OWNER)
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
  @Post('claim')
  @Roles(UserRole.OWNER)
  async claim(@Req() req: any, @Body() dto: ClaimSensorDto) {
    return this.svc.claimForUser(
      { orgId: req.user.orgId, role: req.user.role },
      dto,
    );
  }

  /** GET /sensors/stats  – simple dashboard card */
  @Get('stats')
  @Roles(UserRole.OWNER)
  getStats(@Req() req: any) {
    return this.svc.getStats(req.user.orgId);
  }

  @Roles(UserRole.OWNER)
  @Get(':mac')
  async getOne(@Param('mac') mac: string, @Req() req: any) {
    return this.svc.getDetails(mac.toUpperCase(), req.user.orgId);
  }

  /** PATCH /sensors/:mac – rename / toggle fields (currently label only) */
  @Patch(':mac')
  @Roles(UserRole.OWNER)
  updateSensor(
    @Param('mac') mac: string,
    @Req() req: any,
    @Body() dto: { displayName?: string },
  ) {
    return this.svc.updateSensor(mac.toUpperCase(), req.user.orgId, dto);
  }

  /** POST /sensors/:mac/claim   */
  @Post(':mac/claim')
  @Roles(UserRole.OWNER)
  claimSensor(
    @Param('mac') mac: string,
    @Req() req: any,
    @Body('displayName') displayName?: string,
  ) {
    return this.svc.claimForUser(
      { orgId: req.user.orgId, role: req.user.role },
      { mac, displayName },
    );
  }

  /** POST /sensors/:mac/unclaim  */
  @Post(':mac/unclaim')
  @Roles(UserRole.OWNER)
  unclaimSensor(@Param('mac') mac: string, @Req() req: any) {
    return this.svc.unclaim(mac.toUpperCase(), req.user.orgId);
  }
}
