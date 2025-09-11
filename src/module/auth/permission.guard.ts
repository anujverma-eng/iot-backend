import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgContextUser } from '../../auth/org-context.guard';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Decorator to specify required permissions for an endpoint
 * @param permissions - Array of permission strings required (ALL must be present - AND logic)
 * @example @RequiredPermissions(PERMISSIONS.SENSORS.VIEW, PERMISSIONS.SENSORS.CREATE)
 */
export const RequiredPermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * Decorator to specify that user needs ANY of the specified permissions (OR logic)
 * @param permissions - Array of permission strings (ANY can be present)
 * @example @RequiredAnyPermissions(PERMISSIONS.SENSORS.VIEW, PERMISSIONS.GATEWAYS.VIEW)
 */
export const REQUIRED_ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';
export const RequiredAnyPermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredAnyPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if ((!requiredPermissions || requiredPermissions.length === 0) && 
        (!requiredAnyPermissions || requiredAnyPermissions.length === 0)) {
      return true; // No permission requirements
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as OrgContextUser;

    if (!user?.permissions || user.permissions.length === 0) {
      throw new ForbiddenException('No organization context or permissions found');
    }

    // Check ALL required permissions (AND logic)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission =>
        user.permissions!.includes(permission)
      );

      if (!hasAllPermissions) {
        const missingPermissions = requiredPermissions.filter(
          permission => !user.permissions!.includes(permission)
        );
        
        throw new ForbiddenException(
          `Insufficient permissions. Missing: ${missingPermissions.join(', ')}`
        );
      }
    }

    // Check ANY required permissions (OR logic)
    if (requiredAnyPermissions && requiredAnyPermissions.length > 0) {
      const hasAnyPermission = requiredAnyPermissions.some(permission =>
        user.permissions!.includes(permission)
      );

      if (!hasAnyPermission) {
        throw new ForbiddenException(
          `Insufficient permissions. Need any of: ${requiredAnyPermissions.join(', ')}`
        );
      }
    }

    return true;
  }
}
