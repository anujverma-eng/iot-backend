import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Membership, MembershipDocument, MembershipStatus } from '../module/memberships/memberships.schema';
import { computeEffectivePermissions } from '../common/constants/permissions';

export interface OrgContextUser {
  userId: string;
  sub: string;
  email: string;
  orgId?: string;
  role?: string;
  permissions?: string[];
}

@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as OrgContextUser;

    if (!user?.userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Try to resolve org context from route params, headers, or query
    const orgId = this.resolveOrgId(request);

    // validate mongoId
    if (orgId && Types.ObjectId.isValid(orgId)) {
      // Find membership for this user and org
      const membership = await this.membershipModel
        .findOne({
          userId: new Types.ObjectId(user.userId),
          orgId: new Types.ObjectId(orgId),
          status: { $in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] }
        })
        .lean();

      if (!membership) {
        throw new ForbiddenException('You do not have access to this organization');
      }

      // Attach org context to user
      user.orgId = orgId;
      user.role = membership.role;
      user.permissions = computeEffectivePermissions(
        membership.role,
        membership.allow,
        membership.deny
      );

      return true;
    }

    // If no org specified, check if user has exactly one active membership
    const activeMemberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(user.userId),
        status: MembershipStatus.ACTIVE
      })
      .lean();

    if (activeMemberships.length === 1) {
      // Auto-attach the single membership
      const membership = activeMemberships[0];
      user.orgId = membership.orgId.toString();
      user.role = membership.role;
      user.permissions = computeEffectivePermissions(
        membership.role,
        membership.allow,
        membership.deny
      );

      return true;
    }

    if (activeMemberships.length > 1) {
      throw new BadRequestException({
        status: 400,
        code: 'ORG_REQUIRED',
        message: 'Multiple organizations. Provide x-org-id header or orgId in route/query.',
      });
    }

    // No memberships found - this might be a first-time user
    // Let them through without org context for endpoints like creating first org
    return true;
  }

  private resolveOrgId(request: any): string | undefined {
    // 1. Route parameter :orgId
    if (request.params?.orgId) {
      return request.params.orgId;
    }

    // 2. Header x-org-id
    if (request.headers['x-org-id']) {
      return request.headers['x-org-id'];
    }

    // 3. Query parameter orgId
    if (request.query?.orgId) {
      return request.query.orgId;
    }

    return undefined;
  }
}
