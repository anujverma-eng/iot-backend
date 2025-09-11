import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrgContextGuard } from '../../auth/org-context.guard';

@Module({
  imports: [PassportModule, UsersModule, MembershipsModule],
  providers: [JwtStrategy, OrgContextGuard],
  exports: [OrgContextGuard],
})
export class AuthModule {}
