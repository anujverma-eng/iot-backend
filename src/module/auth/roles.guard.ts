import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/enums/users.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersSvc: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.get<UserRole[]>('roles', ctx.getHandler()) ?? [];

    if (requiredRoles.length === 0) return true; // no role restriction

    const { user } = ctx.switchToHttp().getRequest<{ user?: { sub: string } }>();
    if (!user?.sub) return false;

    const dbUser = await this.usersSvc.findBySub(user.sub);
    return !!dbUser && requiredRoles.includes(dbUser.role);
  }
}
