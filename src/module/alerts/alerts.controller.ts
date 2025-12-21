import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import {
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  ToggleAlertRuleDto,
  QueryAlertsDto,
  QueryAlertHistoryDto,
} from './dto/alert.dto';
import { Types } from 'mongoose';
import { OrgContextGuard, OrgContextUser } from '../../auth/org-context.guard';

@Controller('/alerts')
@UseGuards(OrgContextGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /**
   * Create a new alert rule
   * POST /api/:orgId/alerts
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: { user: OrgContextUser },
    @Body() dto: CreateAlertRuleDto,
  ) {
    if (!req.user.orgId || !req.user.userId) {
      throw new Error('User context missing orgId or userId');
    }
    return this.alertsService.create(req.user.orgId, req.user.userId, dto);
  }

  /**
   * List all alert rules for the organization
   * GET /api/:orgId/alerts?page=1&limit=20&enabled=true&sensorId=...
   */
  @Get()
  async findAll(
    @Req() req: { user: OrgContextUser },
    @Query() query: QueryAlertsDto,
  ) {
        if (!req.user.orgId || !req.user.userId) {
      throw new Error('User context missing orgId or userId');
    }
    return this.alertsService.findAll(req.user.orgId, query);
  }

  /**
   * Get alert statistics
   * GET /api/:orgId/alerts/stats
   */
  @Get('stats')
  async getStats(@Req() req: { user: OrgContextUser }) {
    return this.alertsService.getStats(req.user.orgId!);
  }

  /**
   * Get alert history
   * GET /api/:orgId/alerts/history?page=1&limit=20&ruleId=...&acknowledged=false
   */
  @Get('history')
  async getHistory(
    @Req() req: { user: OrgContextUser },
    @Query() query: QueryAlertHistoryDto,
  ) {
    return this.alertsService.getHistory(req.user.orgId!, query);
  }

  /**
   * Acknowledge a triggered alert
   * PATCH /api/:orgId/alerts/history/:historyId/acknowledge
   */
  @Patch('history/:historyId/acknowledge')
  async acknowledge(
    @Param('historyId') historyId: string,
    @Req() req: { user: OrgContextUser },
  ) {
    return this.alertsService.acknowledge(req.user.orgId!, historyId, req.user.userId);
  }

  /**
   * Get single alert rule by ID
   * GET /api/:orgId/alerts/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: { user: OrgContextUser }) {
    return this.alertsService.findOne(id, req.user.orgId!);
  }

  /**
   * Update an alert rule
   * PATCH /api/:orgId/alerts/:id
   */
  @Patch(':id')
  async update(
    @Req() req: { user: OrgContextUser },
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertsService.update(id, req.user.orgId!, dto);
  }

  /**
   * Toggle alert rule enabled status
   * PATCH /api/:orgId/alerts/:id/toggle
   */
  @Patch(':id/toggle')
  async toggleEnabled(
    @Req() req: { user: OrgContextUser },
    @Param('id') id: string,
    @Body() dto: ToggleAlertRuleDto,
  ) {
    return this.alertsService.toggleEnabled(id, req.user.orgId!, dto.enabled);
  }

  /**
   * Delete an alert rule
   * DELETE /api/:orgId/alerts/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: { user: OrgContextUser }) {
    return this.alertsService.remove(id, req.user.orgId!);
  }
}
