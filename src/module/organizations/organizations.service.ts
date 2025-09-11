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
import { Membership, MembershipDocument, MembershipStatus } from '../memberships/memberships.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Plan.name)
    private readonly planModel: Model<PlanDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
  ) {}

  async createOrgAndSetOwner(
    ownerId: Types.ObjectId,
    dto: CreateOrganizationDto,
  ) {
    // Check if user already owns an organization
    const hasOwnerMembership = await this.membershipModel.exists({
      userId: ownerId,
      role: UserRole.OWNER,
      status: MembershipStatus.ACTIVE
    });
    
    if (hasOwnerMembership) {
      throw new BadRequestException('You already own an organization');
    }

    const caller = await this.userModel.findById(ownerId).lean();
    if (!caller) throw new BadRequestException('User not found');

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

      // Update user (legacy field for backward compatibility)
      await this.userModel.updateOne(
        { _id: ownerId },
        { $set: { orgId: org[0]._id, role: UserRole.OWNER } },
        { session },
      );

      // Create membership (new multi-org system)
      await this.membershipModel.create(
        [
          {
            userId: new Types.ObjectId(ownerId),
            orgId: org[0]._id,
            role: UserRole.OWNER,
            status: MembershipStatus.ACTIVE,
            acceptedAt: new Date(),
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return org[0];
    } catch (err) {
      await session.abortTransaction();
      if (err.code === 11000) {
        throw new BadRequestException('Organization name already exists');
      }
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

  /**
   * Update organization
   */
  async updateOrganization(orgId: string, dto: { name?: string; domain?: string }) {
    try {
      const org = await this.orgModel.findByIdAndUpdate(
        orgId,
        { $set: dto },
        { new: true, runValidators: true }
      );

      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      return org;
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException('Organization name already exists');
      }
      throw new BadRequestException('Failed to update organization');
    }
  }
}
