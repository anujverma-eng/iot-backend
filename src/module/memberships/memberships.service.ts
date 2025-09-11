import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Membership, MembershipDocument, MembershipStatus } from './memberships.schema';
import { User, UserDocument } from '../users/users.schema';
import { Organization, OrganizationDocument } from '../organizations/organizations.schema';
import { Invite, InviteDocument, InviteStatus } from '../invites/invites.schema';
import { UserRole } from '../users/enums/users.enum';
import { computeEffectivePermissions } from '../../common/constants/permissions';

export interface CreateMembershipDto {
  userId: string;
  orgId: string;
  role?: UserRole;
  allow?: string[];
  deny?: string[];
  status?: MembershipStatus;
  invitedBy?: string;
}

export interface UpdateMembershipRoleDto {
  role: UserRole;
}

export interface UpdateMembershipPermissionsDto {
  allow: string[];
  deny: string[];
}

export interface UpdateMembershipDto {
  role?: UserRole;
  allow?: string[];
  deny?: string[];
}

export interface MembershipWithUser {
  _id: string;
  userId: string;
  orgId: string;
  role: UserRole;
  allow: string[];
  deny: string[];
  status: MembershipStatus;
  invitedBy?: string;
  invitedAt?: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    displayName?: string;
    fullName?: string;
  };
  permissions: string[];
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(Invite.name) private inviteModel: Model<InviteDocument>,
  ) {}

  /**
   * Create a new membership
   */
  async create(dto: CreateMembershipDto): Promise<Membership> {
    try {
      // Validate user and org exist
      const [user, org] = await Promise.all([
        this.userModel.findById(dto.userId).lean(),
        this.orgModel.findById(dto.orgId).lean(),
      ]);

      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      // Check if membership already exists
      const existing = await this.membershipModel
        .findOne({ userId: dto.userId, orgId: dto.orgId })
        .lean();

      if (existing) {
        throw new ConflictException({
          status: 409,
          code: 'MEMBERSHIP_EXISTS',
          message: 'User is already a member of this organization',
        });
      }

      // Enforce: only one OWNER per org
      if (dto.role === UserRole.OWNER) {
        const existingOwner = await this.membershipModel
          .findOne({ orgId: dto.orgId, role: UserRole.OWNER })
          .lean();

        if (existingOwner) {
          throw new BadRequestException('Organization already has an owner');
        }
      }

      const membership = new this.membershipModel({
        userId: new Types.ObjectId(dto.userId),
        orgId: new Types.ObjectId(dto.orgId),
        role: dto.role || UserRole.MEMBER,
        allow: dto.allow || [],
        deny: dto.deny || [],
        status: dto.status || MembershipStatus.ACTIVE,
        ...(dto.invitedBy && { invitedBy: new Types.ObjectId(dto.invitedBy) }),
        ...(dto.status === MembershipStatus.INVITED && { invitedAt: new Date() }),
        ...(dto.status === MembershipStatus.ACTIVE && { acceptedAt: new Date() }),
      });

      return await membership.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to create membership');
    }
  }

  /**
   * Get members of an organization with pagination
   */
  async getOrgMembers(
    orgId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<MembershipWithUser>> {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        sort = 'createdAt',
        dir = 'desc',
      } = options;

      const skip = (page - 1) * limit;
      const sortObj: any = { [sort]: dir === 'asc' ? 1 : -1 };

      // Build search filter
      let searchFilter = {};
      if (search) {
        const users = await this.userModel
          .find({
            $or: [
              { email: { $regex: search, $options: 'i' } },
              { displayName: { $regex: search, $options: 'i' } },
            ],
          })
          .select('_id')
          .lean();

        const userIds = users.map(u => u._id);
        searchFilter = { userId: { $in: userIds } };
      }

      const filter = {
        orgId: new Types.ObjectId(orgId),
        status: MembershipStatus.ACTIVE, // Only consider active users
        ...searchFilter,
      };

      const [memberships, total] = await Promise.all([
        this.membershipModel
          .find(filter)
          .populate('userId', 'email displayName fullName')
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .lean(),
        this.membershipModel.countDocuments(filter),
      ]);

      const data = memberships.map((membership: any) => ({
        _id: membership._id.toString(),
        userId: membership.userId._id.toString(),
        orgId: membership.orgId.toString(),
        role: membership.role,
        allow: membership.allow,
        deny: membership.deny,
        status: membership.status,
        invitedBy: membership.invitedBy?.toString(),
        invitedAt: membership.invitedAt,
        acceptedAt: membership.acceptedAt,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        user: {
          email: membership.userId.email,
          displayName: membership.userId.displayName,
          fullName: membership.userId.fullName,
        },
        permissions: computeEffectivePermissions(
          membership.role,
          membership.allow,
          membership.deny
        ),
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch organization members');
    }
  }

  /**
   * Update membership role and optionally permissions
   */
  async updateRole(
    membershipId: string,
    dto: UpdateMembershipRoleDto
  ): Promise<Membership> {
    try {
      const membership = await this.membershipModel.findById(membershipId);
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      // Enforce: only one OWNER per org
      if (dto.role === UserRole.OWNER) {
        const existingOwner = await this.membershipModel
          .findOne({
            orgId: membership.orgId,
            role: UserRole.OWNER,
            _id: { $ne: membershipId },
          })
          .lean();

        if (existingOwner) {
          throw new BadRequestException('Organization already has an owner');
        }
      }

      // Update role
      membership.role = dto.role;
      
      // Note: We don't automatically clear permissions when role changes
      // This allows admins to set custom permissions even with role changes
      
      return await membership.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to update membership role');
    }
  }

  /**
   * Update membership role and permissions together
   */
  async updateMembership(
    membershipId: string,
    dto: UpdateMembershipDto
  ): Promise<Membership> {
    try {
      const membership = await this.membershipModel.findById(membershipId);
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      // Handle role update if provided
      if (dto.role !== undefined) {
        // Enforce: only one OWNER per org
        if (dto.role === UserRole.OWNER) {
          const existingOwner = await this.membershipModel
            .findOne({
              orgId: membership.orgId,
              role: UserRole.OWNER,
              _id: { $ne: membershipId },
            })
            .lean();

          if (existingOwner) {
            throw new BadRequestException('Organization already has an owner');
          }
        }
        membership.role = dto.role;
      }

      // Handle permissions update if provided
      if (dto.allow !== undefined) {
        membership.allow = dto.allow;
      }
      
      if (dto.deny !== undefined) {
        membership.deny = dto.deny;
      }

      return await membership.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to update membership');
    }
  }

  /**
   * Update membership permissions
   */
  async updatePermissions(
    membershipId: string,
    dto: UpdateMembershipPermissionsDto
  ): Promise<Membership> {
    try {
      const membership = await this.membershipModel.findById(membershipId);
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      membership.allow = dto.allow || [];
      membership.deny = dto.deny || [];

      return await membership.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to update membership permissions');
    }
  }

  /**
   * Remove/suspend membership
   */
  async removeMember(membershipId: string, currentUserId?: string): Promise<void> {
    try {
      const membership = await this.membershipModel.findById(membershipId);
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      // Don't allow removing the last owner
      if (membership.role === UserRole.OWNER) {
        const ownerCount = await this.membershipModel.countDocuments({
          orgId: membership.orgId,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        });

        if (ownerCount <= 1) {
          throw new BadRequestException('Cannot remove the last owner of an organization');
        }

        // Prevent owner from removing themselves if they are the last owner
        if (currentUserId && membership.userId.toString() === currentUserId && ownerCount === 1) {
          throw new BadRequestException('You cannot remove yourself as the last owner of the organization');
        }
      }

      // Get user email for invitation cleanup
      const user = await this.userModel.findById(membership.userId).select('email');
      
      // Soft delete by setting status to SUSPENDED
      membership.status = MembershipStatus.SUSPENDED;
      await membership.save();

      // Revoke any pending invitations for this user in this organization
      if (user) {
        await this.inviteModel.updateMany(
          {
            email: user.email,
            orgId: membership.orgId,
            status: { $in: [InviteStatus.CREATED, InviteStatus.SENT, InviteStatus.DELIVERED] },
          },
          {
            status: InviteStatus.REVOKED,
            expiresAt: new Date(), // Expire the token immediately
          }
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to remove member');
    }
  }

  /**
   * Find membership by user and org
   */
  async findByUserAndOrg(
    userId: string,
    orgId: string
  ): Promise<Membership | null> {
    return this.membershipModel
      .findOne({
        userId: new Types.ObjectId(userId),
        orgId: new Types.ObjectId(orgId),
      })
      .lean();
  }

  /**
   * Get user's memberships
   */
  async getUserMemberships(userId: string): Promise<Membership[]> {
    return this.membershipModel
      .find({
        userId: new Types.ObjectId(userId),
        status: { $in: [MembershipStatus.ACTIVE] },
      })
      .populate('orgId', 'name')
      .lean();
  }

  /**
   * Accept membership invitation
   */
  async acceptInvitation(userId: string, orgId: string): Promise<MembershipWithUser> {
    try {
      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        orgId: new Types.ObjectId(orgId),
        status: MembershipStatus.INVITED,
      });

      if (!membership) {
        throw new NotFoundException('Invitation not found');
      }

      membership.status = MembershipStatus.ACTIVE;
      membership.acceptedAt = new Date();

      const savedMembership = await membership.save();

      // Get enriched membership with user details
      const enrichedMembership = await this.membershipModel
        .findById(savedMembership._id)
        .populate('userId', 'email displayName fullName')
        .lean();

      if (!enrichedMembership) {
        throw new NotFoundException('Membership not found after save');
      }

      return {
        _id: enrichedMembership._id.toString(),
        userId: (enrichedMembership.userId as any)._id.toString(),
        orgId: enrichedMembership.orgId.toString(),
        role: enrichedMembership.role,
        allow: enrichedMembership.allow,
        deny: enrichedMembership.deny,
        status: enrichedMembership.status,
        invitedBy: enrichedMembership.invitedBy?.toString(),
        invitedAt: enrichedMembership.invitedAt,
        acceptedAt: enrichedMembership.acceptedAt,
        createdAt: (enrichedMembership as any).createdAt,
        updatedAt: (enrichedMembership as any).updatedAt,
        user: {
          email: (enrichedMembership.userId as any).email,
          displayName: (enrichedMembership.userId as any).displayName,
          fullName: (enrichedMembership.userId as any).fullName,
        },
        permissions: computeEffectivePermissions(
          enrichedMembership.role,
          enrichedMembership.allow,
          enrichedMembership.deny
        ),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to accept invitation');
    }
  }
}
