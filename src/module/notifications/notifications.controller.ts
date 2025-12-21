import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { OrgContextGuard, OrgContextUser } from '../../auth/org-context.guard';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

class GetHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  read?: boolean;
}

class GetRecentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}

@Controller('api/:orgId/notifications')
@UseGuards(OrgContextGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get paginated notification history
   * GET /api/:orgId/notifications/history?page=1&limit=20&read=false
   */
  @Get('history')
  async getHistory(
    @Param('orgId') orgId: string,
    @Query() query: GetHistoryQueryDto,
  ) {
    return this.notificationsService.getHistory(
      orgId,
      query.page || 1,
      query.limit || 20,
      query.read,
    );
  }

  /**
   * Get recent notifications (quick access)
   * GET /api/:orgId/notifications/recent?limit=5
   */
  @Get('recent')
  async getRecent(
    @Param('orgId') orgId: string,
    @Query() query: GetRecentQueryDto,
  ) {
    return this.notificationsService.getRecent(orgId, query.limit || 5);
  }

  /**
   * Get unread notification count
   * GET /api/:orgId/notifications/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Param('orgId') orgId: string) {
    return this.notificationsService.getUnreadCount(orgId);
  }

  /**
   * Mark single notification as read
   * PATCH /api/:orgId/notifications/:id/read
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('orgId') orgId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(notificationId, orgId);
  }

  /**
   * Mark all notifications as read
   * POST /api/:orgId/notifications/mark-all-read
   */
  @Post('mark-all-read')
  async markAllAsRead(@Param('orgId') orgId: string) {
    return this.notificationsService.markAllAsRead(orgId);
  }
}

