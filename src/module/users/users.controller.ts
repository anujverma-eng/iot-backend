import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from './enums/users.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { InviteUserDto } from './dto/user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  /** Owner/Admin invites teammate */
  @Post('invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async invite(@Body() dto: InviteUserDto, @Req() req: any) {
    return this.svc.inviteTeammate(
      { orgId: req.user.orgId, role: req.user.role },
      dto,
    );
  }
}
