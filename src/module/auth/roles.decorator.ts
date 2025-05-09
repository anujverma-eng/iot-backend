import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/enums/users.enum';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
