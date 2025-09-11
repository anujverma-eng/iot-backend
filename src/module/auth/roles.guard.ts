import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/enums/users.enum';
import { OrgContextUser } from '../../auth/org-context.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.get<UserRole[]>('roles', ctx.getHandler()) ?? [];

    if (requiredRoles.length === 0) return true; // no role restriction

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as OrgContextUser;
    
    if (!user?.role) {
      throw new ForbiddenException('No organization context or role found');
    }

    const hasRole = requiredRoles.includes(user.role as UserRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient role. Required: ${requiredRoles.join(' or ')}, Have: ${user.role}`
      );
    }

    return true;
  }
}
