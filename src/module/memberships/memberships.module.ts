import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './memberships.schema';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { Invite, InviteSchema } from '../invites/invites.schema';
import { MembershipsService } from './memberships.service';
import { MembershipsController, PublicMembersController } from './memberships.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Invite.name, schema: InviteSchema },
    ]),
  ],
  controllers: [MembershipsController, PublicMembersController],
  providers: [MembershipsService],
  exports: [MongooseModule, MembershipsService],
})
export class MembershipsModule {}
