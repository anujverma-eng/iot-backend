import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { IotSessionService } from './iot-session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/users.enum';
import { IotCredsDto } from './dto/realtime.dto';
import { GatewaysService } from '../gateways/gateways.service';
import { OrgContextGuard } from 'src/auth/org-context.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { PERMISSIONS } from 'src/common/constants/permissions';

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(
    private readonly svc: IotSessionService,
    private readonly gatewaysSvc: GatewaysService,
  ) {}

  @Post('iot-credentials')
  // @Roles(UserRole.OWNER)
  async getIotCreds(@Body() body: IotCredsDto, @Req() req: any) {
    if (!req.user?.orgId) {
      throw new BadRequestException(
        'You must belong to an organization to access IoT data',
      );
    }

    let gatewayIds: string[];

    // If specific gateway IDs are provided, verify they belong to the user's org
    if (body.gatewayIds && body.gatewayIds.length > 0) {
      // Validate that all requested gateways belong to the user's organization
      gatewayIds = body.gatewayIds.map((id) => id.trim()).filter(Boolean);

      // Get all gateways for the organization to verify access
      const { rows } = await this.gatewaysSvc.listForOrg(req.user.orgId, {
        page: 1,
        limit: 1000, // Assuming organizations won't have more than 1000 gateways
      });

      const orgGatewayIds = rows.map((gw) => gw._id);
      const invalidGateways = gatewayIds.filter(
        (id) => !orgGatewayIds.includes(id),
      );

      if (invalidGateways.length > 0) {
        throw new BadRequestException(
          `You don't have access to these gateways: ${invalidGateways.join(', ')}`,
        );
      }
    } else {
      // If no specific gateways are provided, use all gateways from the user's org
      const { rows } = await this.gatewaysSvc.listForOrg(req.user.orgId, {
        page: 1,
        limit: 1000,
      });

      gatewayIds = rows.map((gw) => gw._id);

      if (gatewayIds.length === 0) {
        throw new BadRequestException(
          'Your organization has no gateways to monitor',
        );
      }
    }

    const duration = Math.min(
      Math.max(body.durationSeconds ?? 3600, 900),
      3600,
    ); // 15–60 min
    return this.svc.getViewerSession(gatewayIds, duration);
  }

  @Post('attach-policy')
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SENSORS.LIVE)
  async attachPolicy(@Req() req: any) {
    // Expect Authorization: Bearer <ID_TOKEN>
    const auth = req.headers?.authorization || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return this.svc.ensureIotPolicyAttached(idToken);
  }
}
