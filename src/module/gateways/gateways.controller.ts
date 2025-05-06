import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GatewaysService } from './gateways.service';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BulkGatewaysDto,
  ClaimGatewayDto,
  CreateGatewayAdminDto,
} from './dto/gateway.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/enums/users.enum';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';

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

  /**
   * Claim a factory‑provisioned gateway for the caller’s org.
   * Body: { claimId:"gw_abc123" }
   */
  @Post('claim')
  async claim(@Req() req: Request, @Body() dto: ClaimGatewayDto) {
    const { orgId } = (req as any).user ?? {};
    return this.gwSvc.claimForOrg(orgId, dto.claimId);
  }
}
