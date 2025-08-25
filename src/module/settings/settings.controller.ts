import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SettingsService } from './settings.service';
import { UserRole } from '../users/enums/users.enum';
import { CreateSettingsDto, UpdateSettingsDto } from './dto/settings.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  async getSettings(@Req() req: any) {
    const { orgId } = req.user ?? {};
    if (!orgId) {
      throw new BadRequestException('You are not associated with an organization');
    }

    const settings = await this.settingsService.findByOrgId(orgId);
    if (!settings) {
      throw new NotFoundException('Settings not found for your organization');
    }

    return settings;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async createSettings(@Body() createSettingsDto: CreateSettingsDto, @Req() req: any) {
    const { orgId } = req.user ?? {};
    if (!orgId) {
      throw new BadRequestException('You are not associated with an organization');
    }

    return this.settingsService.createOrUpdate(orgId, createSettingsDto);
  }

  @Put()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateSettings(@Body() updateSettingsDto: UpdateSettingsDto, @Req() req: any) {
    const { orgId } = req.user ?? {};
    if (!orgId) {
      throw new BadRequestException('You are not associated with an organization');
    }

    return this.settingsService.update(orgId, updateSettingsDto);
  }
}
