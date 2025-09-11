import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invite, InviteSchema } from './invites.schema';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { Membership, MembershipSchema } from '../memberships/memberships.schema';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { MembershipsModule } from '../memberships/memberships.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invite.name, schema: InviteSchema },
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
    MembershipsModule,
    MailModule,
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [MongooseModule, InvitesService],
})
export class InvitesModule {}
