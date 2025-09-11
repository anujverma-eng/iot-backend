import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './users.schema';
import { UsersService } from './users.service';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/organizations.schema';
import { UsersController } from './users.controller';
import { MembershipsModule } from '../memberships/memberships.module';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    MembershipsModule,
    InvitesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [MongooseModule, UsersService],
})
export class UsersModule {}
