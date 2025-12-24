import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertRule, AlertRuleDocument, AlertType } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistoryDocument } from './schemas/alert-history.schema';
import { Sensor, SensorDocument } from '../sensors/sensors.schema';
import { Gateway, GatewayDocument } from '../gateways/gateways.schema';
import {
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  QueryAlertsDto,
  QueryAlertHistoryDto,
} from './dto/alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(AlertRule.name)
    private readonly alertRuleModel: Model<AlertRuleDocument>,
    @InjectModel(AlertHistory.name)
    private readonly alertHistoryModel: Model<AlertHistoryDocument>,
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
    @InjectModel(Gateway.name)
    private readonly gatewayModel: Model<GatewayDocument>,
  ) {}

  /**
   * Create a new alert rule
   */
  async create(
    orgId: string,
    userId: string,
    dto: CreateAlertRuleDto,
  ): Promise<AlertRuleDocument> {
    let displayName: string;

    // Validate device and fetch displayName based on alert type
    if (dto.alertType === AlertType.DEVICE_ONLINE || dto.alertType === AlertType.DEVICE_OFFLINE) {
      // Can be gateway or sensor
      // Try gateway first
      const gw = await this.gatewayModel.findOne({ _id: dto.deviceId }).lean();
      if (gw) {
        if (!gw.orgId || gw.orgId.toString() !== orgId) {
          throw new ForbiddenException('Gateway does not belong to your organization');
        }
        displayName = gw.label || gw._id;
      } else {
        // Try sensor
        const sensor = await this.sensorModel.findOne({ _id: dto.deviceId }).lean();
        if (!sensor) {
          throw new NotFoundException('Device (gateway or sensor) not found');
        }
        if (sensor.orgId && sensor.orgId.toString() !== orgId) {
          throw new ForbiddenException('Sensor does not belong to your organization');
        }
        displayName = sensor.displayName || sensor._id;
      }
    } else {
      // Sensor-based alert
      const sensor = await this.sensorModel.findOne({ _id: dto.deviceId }).lean();
      if (!sensor) {
        throw new NotFoundException('Sensor not found');
      }
      if (sensor.orgId && sensor.orgId.toString() !== orgId) {
        throw new ForbiddenException('Sensor does not belong to your organization');
      }
      displayName = sensor.displayName || sensor._id;

      // DEVICE_OUT_OF_TOLERANCE requires a condition
      if (dto.alertType === AlertType.DEVICE_OUT_OF_TOLERANCE && !dto.condition) {
        throw new BadRequestException('DEVICE_OUT_OF_TOLERANCE alerts require a condition');
      }
    }

    // Validate channels
    if (!dto.channels.email && !dto.channels.sms) {
      throw new BadRequestException(
        'At least one notification channel (email or SMS) must be enabled',
      );
    }

    if (dto.channels.email && !dto.channels.email.enabled) {
      delete dto.channels.email;
    }

    if (dto.channels.sms && !dto.channels.sms.enabled) {
      delete dto.channels.sms;
    }

    if (!dto.channels.email && !dto.channels.sms) {
      throw new BadRequestException(
        'At least one notification channel must be enabled',
      );
    }

    // Validate 'between' operator has value2 when condition is provided
    if (
      dto.condition &&
      dto.condition.operator === 'between' &&
      (dto.condition.value2 === undefined || dto.condition.value2 === null)
    ) {
      throw new BadRequestException(
        'value2 is required for "between" operator',
      );
    }

    const alertRule = await this.alertRuleModel.create({
      orgId: new Types.ObjectId(orgId),
      name: dto.name,
      alertType: dto.alertType,
      deviceId: dto.deviceId,
      displayName,
      condition: dto.condition,
      channels: dto.channels,
      throttleMinutes: dto.throttleMinutes ?? 10,
      enabled: dto.enabled ?? true,
      createdBy: new Types.ObjectId(userId),
      triggerCount: 0,
    });

    return alertRule;
  }

  /**
   * List alert rules for an organization
   * Syncs displayName if device name changed
   */
  async findAll(orgId: string, query: QueryAlertsDto) {
    const { page = 1, limit = 20, enabled, deviceId } = query;
    const skip = (page - 1) * limit;

    const filter: any = {
      orgId: new Types.ObjectId(orgId),
    };

    if (enabled !== undefined) {
      filter.enabled = enabled;
    }

    if (deviceId) {
      filter.deviceId = deviceId;
    }

    const [rules, total] = await Promise.all([
      this.alertRuleModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.alertRuleModel.countDocuments(filter),
    ]);

    // Sync displayName from current device state
    for (const rule of rules as any[]) {
      await this.syncDisplayName(rule);
    }

    return {
      data: rules,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get alert history
   * Syncs displayName from current device state
   */
  async getHistory(orgId: string, query: QueryAlertHistoryDto) {
    const { page = 1, limit = 20, ruleId, deviceId, acknowledged } = query;
    const skip = (page - 1) * limit;

    const filter: any = {
      orgId: new Types.ObjectId(orgId),
    };

    if (ruleId) {
      filter.ruleId = new Types.ObjectId(ruleId);
    }

    if (deviceId) {
      filter.deviceId = deviceId;
    }

    if (acknowledged !== undefined) {
      filter.acknowledged = acknowledged;
    }

    const [history, total] = await Promise.all([
      this.alertHistoryModel
        .find(filter)
        .sort({ triggerTime: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ruleId', 'name')
        .lean(),
      this.alertHistoryModel.countDocuments(filter),
    ]);

    // Sync displayName from current device state
    for (const record of history as any[]) {
      await this.syncDisplayName(record);
    }

    return {
      data: history,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledge(
    orgId: string,
    historyId: string,
    userId: string,
  ): Promise<AlertHistoryDocument> {
    const alertHistory = await this.alertHistoryModel.findOneAndUpdate(
      {
        _id: historyId,
        orgId: new Types.ObjectId(orgId),
      },
      {
        acknowledged: true,
        acknowledgedBy: new Types.ObjectId(userId),
        acknowledgedAt: new Date(),
      },
      { new: true },
    );

    if (!alertHistory) {
      throw new NotFoundException('Alert history not found');
    }

    return alertHistory;
  }

  /**
   * Get alert statistics for dashboard
   */
  async getStats(orgId: string) {
    const [totalRules, activeRules, last24HoursStats, last7DaysStats] =
      await Promise.all([
        this.alertRuleModel.countDocuments({
          orgId: new Types.ObjectId(orgId),
        }),
        this.alertRuleModel.countDocuments({
          orgId: new Types.ObjectId(orgId),
          enabled: true,
        }),
        this.alertHistoryModel.countDocuments({
          orgId: new Types.ObjectId(orgId),
          triggerTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
        this.alertHistoryModel.countDocuments({
          orgId: new Types.ObjectId(orgId),
          triggerTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
      ]);

    const unacknowledged = await this.alertHistoryModel.countDocuments({
      orgId: new Types.ObjectId(orgId),
      acknowledged: false,
    });

    return {
      totalRules,
      activeRules,
      triggersLast24Hours: last24HoursStats,
      triggersLast7Days: last7DaysStats,
      unacknowledgedAlerts: unacknowledged,
    };
  }

  /**
   * Get single alert rule
   */
  async findOne(id: string, orgId: string): Promise<AlertRuleDocument> {
    const alertRule = await this.alertRuleModel.findOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
    });

    if (!alertRule) {
      throw new NotFoundException('Alert rule not found');
    }

    return alertRule;
  }

  /**
   * Update alert rule
   */
  async update(
    id: string,
    orgId: string,
    dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleDocument> {
    let displayName: string | undefined;

    // If updating deviceId, validate and fetch new displayName
    if (dto.deviceId) {
      const existingRule = await this.alertRuleModel.findOne({
        _id: id,
        orgId: new Types.ObjectId(orgId),
      });

      if (!existingRule) {
        throw new NotFoundException('Alert rule not found');
      }

      const alertType = dto.alertType || existingRule.alertType;

      if (alertType === AlertType.DEVICE_ONLINE || alertType === AlertType.DEVICE_OFFLINE) {
        // Can be gateway or sensor
        // Try gateway first
        const gw = await this.gatewayModel.findOne({ _id: dto.deviceId }).lean();
        if (gw) {
          if (!gw.orgId || gw.orgId.toString() !== orgId) {
            throw new ForbiddenException('Gateway does not belong to your organization');
          }
          displayName = gw.label || gw._id;
        } else {
          // Try sensor
          const sensor = await this.sensorModel.findOne({ _id: dto.deviceId }).lean();
          if (!sensor) {
            throw new NotFoundException('Device (gateway or sensor) not found');
          }
          if (sensor.orgId && sensor.orgId.toString() !== orgId) {
            throw new ForbiddenException('Sensor does not belong to your organization');
          }
          displayName = sensor.displayName || sensor._id;
        }
      } else {
        // Sensor-based alert
        const sensor = await this.sensorModel.findOne({ _id: dto.deviceId }).lean();
        if (!sensor) {
          throw new NotFoundException('Sensor not found');
        }
        if (sensor.orgId && sensor.orgId.toString() !== orgId) {
          throw new ForbiddenException('Sensor does not belong to your organization');
        }
        displayName = sensor.displayName || sensor._id;
      }
    }

    // Validate 'between' operator
    if (
      dto.condition &&
      dto.condition.operator === 'between' &&
      !dto.condition.value2
    ) {
      throw new BadRequestException(
        'value2 is required for "between" operator',
      );
    }

    const updatePayload: any = { ...dto };
    if (displayName) {
      updatePayload.displayName = displayName;
    }

    const alertRule = await this.alertRuleModel.findOneAndUpdate(
      {
        _id: id,
        orgId: new Types.ObjectId(orgId),
      },
      updatePayload,
      { new: true },
    );

    if (!alertRule) {
      throw new NotFoundException('Alert rule not found');
    }

    return alertRule;
  }

  /**
   * Toggle alert rule enabled status
   */
  async toggleEnabled(
    id: string,
    orgId: string,
    enabled: boolean,
  ): Promise<AlertRuleDocument> {
    const alertRule = await this.alertRuleModel.findOneAndUpdate(
      {
        _id: id,
        orgId: new Types.ObjectId(orgId),
      },
      { enabled },
      { new: true },
    );

    if (!alertRule) {
      throw new NotFoundException('Alert rule not found');
    }

    return alertRule;
  }

  /**
   * Delete alert rule
   */
  async remove(id: string, orgId: string): Promise<void> {
    const result = await this.alertRuleModel.deleteOne({
      _id: id,
      orgId: new Types.ObjectId(orgId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Alert rule not found');
    }
  }

  /**
   * Helper: Sync displayName from current sensor/gateway state
   * Updates the record in-place and persists if changed
   */
  private async syncDisplayName(record: any): Promise<void> {
    if (!record.deviceId) return;

    let currentDisplayName: string | null = null;

    // Try gateway first
    const gw = await this.gatewayModel.findOne({ _id: record.deviceId }).lean();
    if (gw) {
      currentDisplayName = gw.label || gw._id;
    } else {
      // Try sensor
      const sensor = await this.sensorModel.findOne({ _id: record.deviceId }).lean();
      if (sensor) {
        currentDisplayName = sensor.displayName || sensor._id;
      }
    }

    // Update if changed
    if (currentDisplayName && record.displayName !== currentDisplayName) {
      record.displayName = currentDisplayName;

      // Persist to DB (determine collection from record)
      if (record.ruleId) {
        // It's AlertHistory
        await this.alertHistoryModel.updateOne(
          { _id: record._id },
          { displayName: currentDisplayName },
        );
      } else {
        // It's AlertRule
        await this.alertRuleModel.updateOne(
          { _id: record._id },
          { displayName: currentDisplayName },
        );
      }
    }
  }
}
