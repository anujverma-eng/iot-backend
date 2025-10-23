import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Invite, InviteDocument, InviteStatus } from './invites.schema';
import { User, UserDocument } from '../users/users.schema';
import { Organization, OrganizationDocument } from '../organizations/organizations.schema';
import { Membership, MembershipDocument, MembershipStatus } from '../memberships/memberships.schema';
import { MembershipsService, MembershipWithUser } from '../memberships/memberships.service';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../users/enums/users.enum';
import { ConfigService } from '@nestjs/config';

export interface CreateInviteDto {
  email: string;
  role?: UserRole;
  allow?: string[];
  deny?: string[];
}

export interface BulkInviteUserDto {
  email: string;
  role?: UserRole;
  allow?: string[];
  deny?: string[];
}

export interface BulkCreateInviteDto {
  users: BulkInviteUserDto[];
}

export interface BulkInviteResult {
  successful: {
    email: string;
    invite: {
      id: string;
      email: string;
      role: UserRole;
      status: InviteStatus;
      expiresAt: Date;
    };
  }[];
  failed: {
    email: string;
    error: string;
    code?: string;
  }[];
}

export interface InviteInfo {
  email: string;
  orgName: string;
  role: UserRole;
  allow: string[];
  deny: string[];
  expiresAt: Date;
  status: InviteStatus;
  expired: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  status?: InviteStatus[];
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
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @InjectModel(Invite.name) private inviteModel: Model<InviteDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    private readonly membershipsService: MembershipsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Create and send invite
   */
  async createInvite(
    orgId: string,
    invitedBy: string,
    dto: CreateInviteDto
  ): Promise<Invite> {
    const session = await this.inviteModel.db.startSession();
    
    try {
      session.startTransaction();

      // Validate organization exists
      const org = await this.orgModel.findById(orgId).lean();
      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      // Check if user is already a member
      // First, normalize email to lowercase
      const normalizedEmail = dto.email.trim().toLowerCase();
      
      // Find user by email first
      const existingUser = await this.userModel.findOne({ email: normalizedEmail }).lean();
      if (existingUser) {
        // Check if this user is already a member of this org
        const existingMembership = await this.membershipModel.findOne({
          orgId: new Types.ObjectId(orgId),
          userId: existingUser._id,
          status: { $ne: MembershipStatus.SUSPENDED }
        }).lean();

        if (existingMembership) {
          throw new ConflictException({
            status: 409,
            code: 'MEMBERSHIP_EXISTS',
            message: 'User is already a member of this organization',
          });
        }
      }

      // Check for existing pending invite and revoke it
      const existingInvite = await this.inviteModel.findOne({
        email: normalizedEmail,
        orgId: new Types.ObjectId(orgId),
        status: { $in: [InviteStatus.CREATED, InviteStatus.SENT, InviteStatus.DELIVERED] },
      });

      if (existingInvite) {
        // Revoke old invite and create new one
        existingInvite.status = InviteStatus.REVOKED;
        await existingInvite.save();
      }

      // Ensure user exists (create if needed)
      let user = await this.userModel.findOne({ email: normalizedEmail });
      if (!user) {
        const [newUser] = await this.userModel.create([{
          email: normalizedEmail,
          role: dto?.role || UserRole.MEMBER, // Default role for new users
        }], { session });
        user = newUser;
      }

      // Create or update membership in INVITED status
      let membership = await this.membershipModel.findOne({
        userId: user._id,
        orgId: new Types.ObjectId(orgId),
      });

      if (membership) {
        // Update existing membership
        membership.role = dto.role || UserRole.MEMBER;
        membership.allow = dto.allow || [];
        membership.deny = dto.deny || [];
        membership.status = MembershipStatus.INVITED;
        membership.invitedBy = new Types.ObjectId(invitedBy);
        membership.invitedAt = new Date();
        await membership.save({ session });
      } else {
        // Create new membership
        const [newMembership] = await this.membershipModel.create([{
          userId: user._id,
          orgId: new Types.ObjectId(orgId),
          role: dto?.role || UserRole.MEMBER,
          allow: dto?.allow || [],
          deny: dto?.deny || [],
          status: MembershipStatus.INVITED,
          invitedBy: new Types.ObjectId(invitedBy),
          invitedAt: new Date(),
        }], { session });
        membership = newMembership;
      }

      // Generate secure token
      const token = this.generateToken();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      // Create invite
      const [invite] = await this.inviteModel.create([{
        email: normalizedEmail,
        orgId: new Types.ObjectId(orgId),
        role: dto?.role || UserRole.MEMBER,
        allow: dto?.allow || [],
        deny: dto?.deny || [],
        token,
        expiresAt,
        status: InviteStatus.CREATED,
        invitedBy: new Types.ObjectId(invitedBy),
      }], { session });

      await session.commitTransaction();

      // Send email (outside transaction)
      try {
        const inviteUrl = this.buildInviteUrl(token);
        
        // Get inviter details for the email
        const inviterUser = await this.userModel.findById(invitedBy).lean();
        const inviterName = inviterUser?.fullName || inviterUser?.email || 'Someone';

        // Prepare email data
        const emailData = {
          orgName: org.name,
          role: dto.role || UserRole.MEMBER,
          inviteUrl,
          expiresAt: expiresAt.toLocaleDateString(),
          inviterName,
        };

        // Use simple email with generated HTML (fallback method that works)
        const htmlBody = this.mailService.generateInviteEmailHtml(emailData);
        const subject = `You're invited to join ${org.name}`;

        const messageId = await this.mailService.sendSimpleEmail(
          dto.email,
          subject,
          htmlBody
        );

        // Update invite with email info
        invite.status = InviteStatus.SENT;
        invite.lastEmailMessageId = messageId;
        invite.deliveryAt = new Date();
        await invite.save();

        this.logger.log(`Invite created and email sent for ${dto.email} for org ${org.name}`);
        this.logger.log(`Email MessageId: ${messageId}`);
        this.logger.log(`Invite URL: ${inviteUrl}`);
      } catch (emailError) {
        this.logger.error(`Failed to send email for invite ${dto.email}:`, emailError);
        // Update invite status to indicate email failed
        invite.status = InviteStatus.CREATED; // Keep as created since email failed
        await invite.save();
        // Don't fail the whole operation if email fails
      }

      return invite;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to create invite:', error);
      throw new BadRequestException('Failed to create invite');
    } finally {
      session.endSession();
    }
  }

  /**
   * Create and send bulk invites
   */
  async createBulkInvites(
    orgId: string,
    invitedBy: string,
    dto: BulkCreateInviteDto
  ): Promise<BulkInviteResult> {
    const result: BulkInviteResult = {
      successful: [],
      failed: [],
    };

    // Validate organization exists
    const org = await this.orgModel.findById(orgId).lean();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Process each user invitation
    for (const userDto of dto.users) {
      try {
        const invite = await this.createInvite(orgId, invitedBy, userDto);
        
        result.successful.push({
          email: userDto.email,
          invite: {
            id: (invite as any)._id.toString(),
            email: invite.email,
            role: invite.role,
            status: invite.status,
            expiresAt: invite.expiresAt,
          },
        });

        this.logger.log(`Successfully created invite for ${userDto.email}`);
      } catch (error) {
        let errorMessage = 'Failed to create invite';
        let errorCode: string | undefined;

        if (error instanceof HttpException) {
          const response = error.getResponse();
          if (typeof response === 'object' && 'message' in response) {
            errorMessage = (response as any).message;
          }
          if (typeof response === 'object' && 'code' in response) {
            errorCode = (response as any).code;
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        result.failed.push({
          email: userDto.email,
          error: errorMessage,
          code: errorCode,
        });

        this.logger.error(`Failed to create invite for ${userDto.email}:`, error);
      }
    }

    return result;
  }

  /**
   * Get invites for organization
   */
  async getOrgInvites(
    orgId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Invite>> {
    try {
      const {
        page = 1,
        limit = 20,
        status = [],
      } = options;

      const skip = (page - 1) * limit;

      let filter: any = { orgId: new Types.ObjectId(orgId) };
      if (status.length > 0) {
        filter.status = { $in: status };
      }

      const [invites, total] = await Promise.all([
        this.inviteModel
          .find(filter)
          .populate('orgId', 'name')
          .populate('invitedBy', 'email displayName fullName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.inviteModel.countDocuments(filter),
      ]);

      return {
        data: invites,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch invites');
    }
  }

  /**
   * Get invite by token (public)
   */
  async getInviteByToken(token: string): Promise<InviteInfo> {
    try {
      const invite = await this.inviteModel
        .findOne({ token })
        .populate('orgId', 'name')
        .lean();

      if (!invite) {
        throw new NotFoundException({
          status: 404,
          code: 'INVITE_NOT_FOUND',
          message: 'Invite token is invalid.',
        });
      }

      const now = new Date();
      const expired = now > invite.expiresAt;

      if (expired && invite.status !== InviteStatus.EXPIRED) {
        // Mark as expired
        await this.inviteModel.updateOne(
          { _id: invite._id },
          { status: InviteStatus.EXPIRED }
        );
      }

      return {
        email: invite.email,
        orgName: (invite.orgId as any).name,
        role: invite.role,
        allow: invite.allow,
        deny: invite.deny,
        expiresAt: invite.expiresAt,
        status: expired ? InviteStatus.EXPIRED : invite.status,
        expired,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch invite');
    }
  }

  /**
   * Accept invite
   */
  async acceptInvite(token: string, userId: string): Promise<MembershipWithUser> {
    const session = await this.inviteModel.db.startSession();

    try {
      session.startTransaction();

      const invite = await this.inviteModel.findOne({ token });
      if (!invite) {
        throw new NotFoundException({
          status: 404,
          code: 'INVITE_NOT_FOUND',
          message: 'Invite token is invalid.',
        });
      }

      if (invite.status === InviteStatus.ACCEPTED) {
        throw new BadRequestException({
          status: 409,
          code: 'INVITE_ALREADY_ACCEPTED',
          message: 'This invite has already been accepted.',
        });
      }

      if (invite.status === InviteStatus.REVOKED) {
        throw new BadRequestException({
          status: 423,
          code: 'INVITE_REVOKED',
          message: 'This invite has been revoked.',
        });
      }

      if (new Date() > invite.expiresAt) {
        invite.status = InviteStatus.EXPIRED;
        await invite.save({ session });
        throw new BadRequestException({
          status: 410,
          code: 'INVITE_EXPIRED',
          message: 'This invite has expired.',
        });
      }

      // Verify user email matches invite (case-insensitive)
      const user = await this.userModel.findById(userId);
      if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new BadRequestException({
          status: 403,
          code: 'EMAIL_MISMATCH',
          message: 'Your email does not match the invited email.',
        });
      }

      // Accept the membership and get the enriched membership details
      const membership = await this.membershipsService.acceptInvitation(userId, invite.orgId.toString());

      // Mark invite as accepted and expire the token
      invite.status = InviteStatus.ACCEPTED;
      invite.acceptedBy = new Types.ObjectId(userId);
      invite.acceptedAt = new Date();
      invite.expiresAt = new Date(); // Expire the token immediately
      await invite.save({ session });

      await session.commitTransaction();

      this.logger.log(`User ${user.email} accepted invite for org ${invite.orgId}`);

      return membership;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to accept invite');
    } finally {
      session.endSession();
    }
  }

  /**
   * Decline invite
   */
  async declineInvite(token: string, userId?: string): Promise<void> {
    try {
      const invite = await this.inviteModel.findOne({ token });
      if (!invite) {
        throw new NotFoundException({
          status: 404,
          code: 'INVITE_NOT_FOUND',
          message: 'Invite token is invalid.',
        });
      }

      if (invite.status === InviteStatus.DECLINED) {
        throw new BadRequestException({
          status: 409,
          code: 'INVITE_ALREADY_DECLINED',
          message: 'This invite has already been declined.',
        });
      }

      // Mark invite as declined and expire the token
      invite.status = InviteStatus.DECLINED;
      invite.declinedAt = new Date();
      invite.expiresAt = new Date(); // Expire the token immediately
      await invite.save();

      // Find and delete the pending membership
      if (userId) {
        const membership = await this.membershipModel.findOne({
          userId: new Types.ObjectId(userId),
          orgId: invite.orgId,
          status: MembershipStatus.INVITED,
        });

        if (membership) {
          await this.membershipModel.deleteOne({ _id: membership._id });
          this.logger.log(`Deleted declined membership for user ${userId} in org ${invite.orgId}`);
        }
      }

      this.logger.log(`Invite ${token} declined`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to decline invite');
    }
  }

  /**
   * Revoke invite (with org verification)
   */
  async revokeInvite(token: string, orgId?: string): Promise<void> {
    try {
      const invite = await this.inviteModel.findOne({ token });
      if (!invite) {
        throw new NotFoundException({
          status: 404,
          code: 'INVITE_NOT_FOUND',
          message: 'Invite token is invalid.',
        });
      }

      // Verify orgId if provided (for org-scoped revocation)
      if (orgId && invite.orgId.toString() !== orgId) {
        throw new BadRequestException({
          status: 400,
          code: 'INVITE_ORG_MISMATCH',
          message: 'Invite does not belong to the specified organization.',
        });
      }

      if ([InviteStatus.ACCEPTED, InviteStatus.DECLINED, InviteStatus.EXPIRED].includes(invite.status)) {
        throw new BadRequestException({
          status: 400,
          code: 'INVITE_CANNOT_REVOKE',
          message: 'Cannot revoke an invite that has been accepted, declined, or expired.',
        });
      }

      // Find the user by email to get their userId
      const user = await this.userModel.findOne({ email: invite.email });
      
      // Revoke the invitation
      invite.status = InviteStatus.REVOKED;
      invite.expiresAt = new Date(); // Expire the token immediately
      await invite.save();

      // Remove the associated membership if it exists and is in INVITED status
      if (user) {
        const membership = await this.membershipModel.findOne({
          userId: user._id,
          orgId: invite.orgId,
          status: MembershipStatus.INVITED,
        });

        if (membership) {
          await this.membershipModel.deleteOne({ _id: membership._id });
          this.logger.log(`Deleted invited membership for user ${user.email} in org ${invite.orgId}`);
        }
      }

      this.logger.log(`Invite ${token} revoked and associated membership cleaned up`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to revoke invite');
    }
  }

  /**
   * Get pending invites for user email
   */
  async getUserPendingInvites(email: string): Promise<Invite[]> {
    return this.inviteModel
      .find({
        email,
        status: { $in: [InviteStatus.CREATED, InviteStatus.SENT, InviteStatus.DELIVERED, InviteStatus.DECLINED] },
        // expiresAt: { $gt: new Date() },
      })
      .populate('orgId', 'name')
      .populate('invitedBy', 'email displayName fullName')
      .lean();
  }

  /**
   * Generate secure token
   */
  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  /**
   * Build invite URL
   */
  private buildInviteUrl(token: string): string {
    const baseUrl = this.config.get('app.frontendUrl') || 'http://localhost:3001';
    return `${baseUrl}/invites/${token}`;
  }
}
