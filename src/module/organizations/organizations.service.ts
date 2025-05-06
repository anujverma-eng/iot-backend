import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Organization, OrganizationDocument } from './organizations.schema';
import { Model, Types } from 'mongoose';
import { Plan, PlanDocument } from '../plans/plans.schema';
import { PlanName } from '../plans/enums/plan.enum';
import { User, UserDocument } from '../users/users.schema';
import { UserRole } from '../users/enums/users.enum';
import { CreateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Plan.name)
    private readonly planModel: Model<PlanDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createOrgAndSetOwner(
    ownerId: Types.ObjectId,
    dto: CreateOrganizationDto,
  ) {
    /* ensure caller is not in an org already */
    const caller = await this.userModel.findById(ownerId).lean();
    if (!caller) throw new BadRequestException('User not found');
    if (caller.orgId)
      throw new BadRequestException('You already belong to an organization');

    const planToUse = dto?.planId
      ? await this.planModel.findById(dto.planId).lean()
      : await this.planModel.findOne({ name: PlanName.FREE }).lean();
    if (!planToUse) throw new BadRequestException('Plan not found');

    if (!planToUse) throw new Error('Free plan missing – run seed first');

    /* create org & update user in a single session */
    const session = await this.orgModel.db.startSession();
    try {
      session.startTransaction();

      const org = await this.orgModel.create(
        [
          {
            name: dto.name,
            domain: caller.email.split('@')[1], // e.g., acme.com
            planId: planToUse._id,
          },
        ],
        { session },
      );

      await this.userModel.updateOne(
        { _id: ownerId },
        { $set: { orgId: org[0]._id, role: UserRole.OWNER } },
        { session },
      );

      await session.commitTransaction();
      return org[0];
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async findByIdWithPlan(id: Types.ObjectId | string) {
    const org = await this.orgModel
      .findById(id)
      .populate('planId')
      .lean()
      .exec();

    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
}
