import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './users.schema';
import { InviteUserDto, MeDto, UpdateUserInfoDto } from './dto/user.dto';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly cfg: ConfigService,
  ) {}

  async findOrCreateFromToken(token: { sub: string; email: string }) {
    /* 1️⃣ Look for existing user by cognitoSub (normal returning user) */
    const bySub = await this.userModel
      .findOne({ cognitoSub: token.sub })
      .lean()
      .exec();
    if (bySub) return bySub;

    /* 2️⃣ Look for existing user by email (may have been invited) */
    const normalizedEmail = token.email.trim().toLowerCase();
    const byEmail = await this.userModel
      .findOne({ email: normalizedEmail })
      .exec();

    if (byEmail) {
      // User exists but doesn't have cognitoSub yet - link the accounts
      byEmail.cognitoSub = token.sub;
      await byEmail.save();
      return byEmail.toObject();
    }

    /* 3️⃣ Completely new user - create basic user record */
    // Note: Organization membership will be handled separately through invites
    const created = await this.userModel.create({
      email: normalizedEmail,
      cognitoSub: token.sub,
      // Don't set orgId/role here - those are managed through Memberships now
    });
    return created.toObject();
  }

  /** Simple lookup used by RolesGuard */
  async findBySub(sub: string) {
    return this.userModel.findOne({ cognitoSub: sub }).lean();
  }

  async getMe(sub: string): Promise<MeDto> {
    const user = await this.userModel
      .findOne({ cognitoSub: sub })
      .select('-__v -createdAt -updatedAt')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return plainToInstance(MeDto, user, { excludeExtraneousValues: true });
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, dto: { displayName?: string }) {
    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: dto },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      throw new BadRequestException('Failed to update profile');
    }
  }

  /**
   * Update user information (email, fullName, phoneNumber, countryCode)
   */
  async updateUserInfo(userId: string, dto: UpdateUserInfoDto) {
    try {
      // If email is being updated, check for uniqueness
      if (dto.email) {
        const normalizedEmail = dto.email.trim().toLowerCase();
        const existingUser = await this.userModel.findOne({
          email: normalizedEmail,
          _id: { $ne: userId }, // Exclude current user
        });

        if (existingUser) {
          throw new BadRequestException('Email is already in use');
        }

        dto.email = normalizedEmail;
      }

      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: dto },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update user information');
    }
  }

  /**
   * Update user email (after Cognito verification)
   */
  async updateEmail(userId: string, newEmail: string) {
    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: { email: newEmail } },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      throw new BadRequestException('Failed to update email');
    }
  }
}
