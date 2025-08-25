import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';
import { CreateSettingsDto, UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async create(orgId: string, createSettingsDto: CreateSettingsDto): Promise<SettingsDocument> {
    const settings = new this.settingsModel({
      ...createSettingsDto,
      orgId: new Types.ObjectId(orgId),
    });
    return settings.save();
  }

  async findByOrgId(orgId: string): Promise<SettingsDocument | null> {
    return this.settingsModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
  }

  async update(orgId: string, updateSettingsDto: UpdateSettingsDto): Promise<SettingsDocument> {
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

  async createOrUpdate(orgId: string, settingsData: CreateSettingsDto): Promise<SettingsDocument> {
    const existingSettings = await this.findByOrgId(orgId);
    
    if (existingSettings) {
      return this.update(orgId, settingsData);
    } else {
      return this.create(orgId, settingsData);
    }
  }

  async delete(orgId: string): Promise<boolean> {
    const result = await this.settingsModel.deleteOne({ orgId: new Types.ObjectId(orgId) }).exec();
    return result.deletedCount > 0;
  }
}
