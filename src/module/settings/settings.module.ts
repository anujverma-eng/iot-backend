import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { User, UserSchema } from '../users/users.schema';
import { Organization, OrganizationSchema } from '../organizations/organizations.schema';
import { UsersService } from '../users/users.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name, schema: SettingsSchema },
      {name: User.name, schema: UserSchema},
      {name: Organization.name, schema: OrganizationSchema}
    ]),
  ],
  providers: [SettingsService, UsersService],
  controllers: [SettingsController],
  exports: [MongooseModule, SettingsService],
})
export class SettingsModule {}
