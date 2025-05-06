import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SensorsService } from './sensors.service';
import { plainToInstance } from 'class-transformer';
import { SensorResponseDto } from './dto/sensor.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';

@Controller('sensors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SensorsController {
  constructor(private readonly svc: SensorsService) {}

  /** GET /sensors/by-gateway/:gatewayId */
  @Roles(UserRole.MEMBER, UserRole.VIEWER, UserRole.OWNER)
  @Get('by-gateway/:gatewayId')
  async listByGateway(@Param('gatewayId') gatewayId: string, @Req() req: any) {
    const rows = await this.svc.findByGateway(gatewayId, req.user.orgId);
    return plainToInstance(SensorResponseDto, rows, {
      excludeExtraneousValues: true,
    });
  }
}
