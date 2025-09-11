import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument, UserSettings, UserSettingsDocument, OrgChoiceMode } from './settings.schema';
import { CreateSettingsDto, UpdateSettingsDto, UpdateUserSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel(UserSettings.name) private userSettingsModel: Model<UserSettingsDocument>,
  ) {}

  // Organization Settings Methods
  async findByOrgId(orgId: string): Promise<SettingsDocument | null> {
    return this.settingsModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
  }

  async createOrUpdate(orgId: string, settingsData: CreateSettingsDto | UpdateSettingsDto): Promise<SettingsDocument> {
    const existingSettings = await this.findByOrgId(orgId);
    
    if (existingSettings) {
      return this.update(orgId, settingsData);
    } else {
      // For creation, ensure we have required fields
      const createData: CreateSettingsDto = {
        sensorOfflineTimeOut: settingsData.sensorOfflineTimeOut || 10 // Default value
      };
      return this.create(orgId, createData);
    }
  }

  private async create(orgId: string, createSettingsDto: CreateSettingsDto): Promise<SettingsDocument> {
    const settings = new this.settingsModel({
      ...createSettingsDto,
      orgId: new Types.ObjectId(orgId),
    });
    return settings.save();
  }

  private async update(orgId: string, updateSettingsDto: UpdateSettingsDto): Promise<SettingsDocument> {
    const settings = await this.settingsModel.findOneAndUpdate(
      { orgId: new Types.ObjectId(orgId) },
      updateSettingsDto,
      { new: true, runValidators: true }
    ).exec();

    if (!settings) {
      throw new NotFoundException('Settings not found for this organization');
    }

    return settings;
  }

  // User Settings Methods
  async findUserSettingsByUserId(userId: string): Promise<UserSettingsDocument | null> {
    return this.userSettingsModel.findOne({ userId: new Types.ObjectId(userId) }).populate('defaultOrgId').exec();
  }

  async updateUserSettings(userId: string, updateUserSettingsDto: UpdateUserSettingsDto): Promise<UserSettingsDocument> {
    const updateData: any = { ...updateUserSettingsDto };
    
    // Business logic for orgChoiceMode and defaultOrgId relationship
    if (updateUserSettingsDto.orgChoiceMode) {
      if (updateUserSettingsDto.orgChoiceMode === OrgChoiceMode.ASK_EVERY_TIME) {
        // When user chooses ASK_EVERY_TIME, clear defaultOrgId since it's not relevant
        updateData.defaultOrgId = null;
      } else if (updateUserSettingsDto.orgChoiceMode === OrgChoiceMode.REMEMBER) {
        // When user chooses REMEMBER but doesn't provide defaultOrgId, we can allow it
        // The frontend should handle this case or user can set it later
        if (updateUserSettingsDto.defaultOrgId) {
          updateData.defaultOrgId = new Types.ObjectId(updateUserSettingsDto.defaultOrgId);
        }
      }
    } else {
      // If only defaultOrgId is being updated without orgChoiceMode change
      if (updateUserSettingsDto.defaultOrgId) {
        updateData.defaultOrgId = new Types.ObjectId(updateUserSettingsDto.defaultOrgId);
      }
    }

    const userSettings = await this.userSettingsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      updateData,
      { new: true, runValidators: true, upsert: true }
    ).populate('defaultOrgId').exec();

    return userSettings;
  }

  async createOrUpdateUserSettings(userId: string, settingsData: UpdateUserSettingsDto): Promise<UserSettingsDocument> {
    return this.updateUserSettings(userId, settingsData);
  }
}
