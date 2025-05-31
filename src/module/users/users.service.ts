import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './users.schema';
import { UserRole, UserStatus } from './enums/users.enum';
import { InviteUserDto, MeDto } from './dto/user.dto';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService {
  private readonly cogClient: CognitoIdentityProviderClient;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly cfg: ConfigService,
  ) {
    this.cogClient = new CognitoIdentityProviderClient({
      region: this.cfg.get('cognito.region'),
    });
  }

  async findOrCreateFromToken(token: { sub: string; email: string }) {
    /* 1️ look by sub (normal return‑user path) */
    const bySub = await this.userModel
      .findOne({ cognitoSub: token.sub })
      .lean()
      .exec();
    if (bySub) return bySub;

    /* 2️ invited row may exist keyed by e‑mail but without sub */
    const invited = await this.userModel
      .findOne({ email: token.email, status: UserStatus.INVITED })
      .exec();

    if (invited) {
      invited.cognitoSub = token.sub;
      invited.status = UserStatus.ACTIVE;
      await invited.save();
      return invited.toObject();
    }

    /* 3 completely new user – create minimal viewer row */
    const created = await this.userModel.create({
      orgId: null,
      email: token.email,
      cognitoSub: token.sub,
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
    });
    return created.toObject();
  }

  /** Simple lookup used by RolesGuard */
  async findBySub(sub: string) {
    return this.userModel.findOne({ cognitoSub: sub }).lean();
  }

  async inviteTeammate(
    inviter: { orgId: string; role: string },
    dto: InviteUserDto,
  ) {
    if (!inviter.orgId)
      throw new BadRequestException('You are not in an organization');

    if (![UserRole.OWNER, UserRole.ADMIN].includes(inviter.role as UserRole))
      throw new BadRequestException('Only owner or admin can invite');

    // 1) check plan limit
    const memberCount = await this.userModel.countDocuments({
      orgId: inviter.orgId,
      status: { $ne: 'disabled' },
    });

    const org = await this.orgModel
      .findById(inviter.orgId)
      .populate<{ planId: { maxUsers: number } }>('planId', 'maxUsers')
      .lean();

    if (!org) throw new BadRequestException('Organization not found');

    if (memberCount >= org.planId.maxUsers)
      throw new BadRequestException('User limit exceeded. Upgrade plan.');

    // 2) does email already exist?
    const existing = await this.userModel.findOne({ email: dto.email }).lean();
    if (existing) {
      if (String(existing.orgId) === inviter.orgId)
        throw new ConflictException('Already a member of this organization');
      else
        throw new ConflictException(
          'User already belongs to another organization',
        );
    }

    // 3) create invited row in Mongo
    const invited = await this.userModel.create({
      orgId: inviter.orgId,
      email: dto.email,
      role: dto.role,
      status: UserStatus.INVITED,
    });

    // 4) tell Cognito to send invite e‑mail (silently skip if user exists)
    try {
      await this.cogClient.send(
        new AdminCreateUserCommand({
          UserPoolId: this.cfg.get('cognito.userPoolId'),
          Username: dto.email,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'SUPPRESS', // <- keeps it in invited state until first password set
        }),
      );
    } catch (err: any) {
      if (err.name !== 'UsernameExistsException') throw err; // real error bubble up
      // user already in pool → nothing to do
    }

    return invited.toObject();
  }

  async getMe(sub: string): Promise<MeDto> {
    const user = await this.userModel
      .findOne({ cognitoSub: sub })
      .select('-__v -createdAt -updatedAt')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return plainToInstance(MeDto, user, { excludeExtraneousValues: true });
  }
}
