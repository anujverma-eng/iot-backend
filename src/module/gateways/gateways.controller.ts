import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GatewaysService } from './gateways.service';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClaimGatewayDto } from './dto/gateway.dto';

@Controller('gateways')
export class GatewaysController {
  constructor(private readonly gwSvc: GatewaysService) {}

  /**
   * Claim a factory‑provisioned gateway for the caller’s org.
   * Body: { claimId:"gw_abc123" }
   */
  @UseGuards(JwtAuthGuard)
  @Post('claim')
  async claim(@Req() req: Request, @Body() dto: ClaimGatewayDto) {
    const { orgId } = (req as any).user ?? {};
    return this.gwSvc.claimForOrg(orgId, dto.claimId);
  }
}
