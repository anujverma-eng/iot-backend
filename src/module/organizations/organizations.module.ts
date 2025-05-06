import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from './organizations.schema';
import { Plan, PlanSchema } from '../plans/plans.schema';
import { User, UserSchema } from '../users/users.schema';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
  ],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [MongooseModule, OrganizationsService],
})
export class OrganizationsModule {}
