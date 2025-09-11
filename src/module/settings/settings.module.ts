import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema, UserSettings, UserSettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { UsersService } from '../users/users.service';
import { Membership, MembershipSchema } from '../memberships/memberships.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name, schema: SettingsSchema },
      { name: UserSettings.name, schema: UserSettingsSchema },
      {name: User.name, schema: UserSchema},
      {name: Organization.name, schema: OrganizationSchema},
      {name: Membership.name, schema: MembershipSchema}
    ]),
  ],
  providers: [SettingsService, UsersService],
  controllers: [SettingsController],
  exports: [MongooseModule, SettingsService],
})
export class SettingsModule {}
