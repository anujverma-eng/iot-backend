import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Put,
  Req,
  UseGuards
} from '@nestjs/common';
import { OrgContextGuard, OrgContextUser } from '../../auth/org-context.guard';
import { PERMISSIONS } from '../../common/constants/permissions';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequiredPermissions } from '../auth/permission.guard';
import { UpdateSettingsDto, UpdateUserSettingsDto } from './dto/settings.dto';
import { OrgChoiceMode } from './settings.schema';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Organization Settings Endpoints (Admin/Owner only)
  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SETTINGS.VIEW)
  @Get()
  async getOrgSettings(@Req() req: { user: OrgContextUser }) {
    try {
      if (!req.user.orgId) {
        throw new HttpException('Organization context required', HttpStatus.BAD_REQUEST);
      }

      let settings = await this.settingsService.findByOrgId(req.user.orgId);
      
      // Create default settings if none exist
      if (!settings) {
        settings = await this.settingsService.createOrUpdate(req.user.orgId, {
          sensorOfflineTimeOut: 30 // Default 10 minutes
        });
      }

      return {
        status: 'success',
        data: {
          sensorOfflineTimeOut: settings.sensorOfflineTimeOut,
          orgId: settings.orgId
        },
        message: 'Organization settings retrieved successfully'
      };
    } catch (error) {
      throw new HttpException('Error fetching organization settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(OrgContextGuard, PermissionGuard)
  @RequiredPermissions(PERMISSIONS.SETTINGS.UPDATE_SENSOR_OFFLINE_TIME)
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateOrgSettings(
    @Body() updateSettingsDto: UpdateSettingsDto, 
    @Req() req: { user: OrgContextUser }
  ) {
    try {
      if (!req.user.orgId) {
        throw new HttpException('Organization context required', HttpStatus.BAD_REQUEST);
      }

      const settings = await this.settingsService.createOrUpdate(req.user.orgId, updateSettingsDto);

      return {
        status: 'success',
        data: {
          sensorOfflineTimeOut: settings.sensorOfflineTimeOut,
          orgId: settings.orgId
        },
        message: 'Organization settings updated successfully'
      };
    } catch (error) {
      throw new HttpException('Error updating organization settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // User Settings Endpoints (Personal preferences)
  @Get('me')
  async getUserSettings(@Req() req: { user: OrgContextUser }) {
    try {
      if (!req.user.userId) {
        throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
      }

      let userSettings = await this.settingsService.findUserSettingsByUserId(req.user.userId);
      
      // Return default settings if none exist
      if (!userSettings) {
        userSettings = await this.settingsService.createOrUpdateUserSettings(req.user.userId, {
          orgChoiceMode: OrgChoiceMode.REMEMBER
        });
      }

      return {
        status: 'success',
        data: {
          userId: userSettings.userId,
          defaultOrgId: userSettings.defaultOrgId,
          orgChoiceMode: userSettings.orgChoiceMode
        },
        message: 'User settings retrieved successfully'
      };
    } catch (error) {
      throw new HttpException('Error fetching user settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  async updateUserSettings(
    @Body() updateUserSettingsDto: UpdateUserSettingsDto, 
    @Req() req: { user: OrgContextUser }
  ) {
    try {
      if (!req.user.userId) {
        throw new HttpException('User authentication required', HttpStatus.UNAUTHORIZED);
      }

      const userSettings = await this.settingsService.updateUserSettings(req.user.userId, updateUserSettingsDto);

      return {
        status: 'success',
        data: {
          userId: userSettings.userId,
          defaultOrgId: userSettings.defaultOrgId,
          orgChoiceMode: userSettings.orgChoiceMode
        },
        message: updateUserSettingsDto.orgChoiceMode === OrgChoiceMode.ASK_EVERY_TIME 
          ? 'User settings updated. Default organization cleared since you chose to be asked every time.'
          : 'User settings updated successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error updating user settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
