import {
  Body,
  Controller,
  Get,
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
import { InviteUserDto, MeDto } from './dto/user.dto';

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

  @Get('me')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  async me(@Req() req: any): Promise<MeDto> {
    return this.svc.getMe(req.user.sub);   // 👈 single service call
  }
  
}
