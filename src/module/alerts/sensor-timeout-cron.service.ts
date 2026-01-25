import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { AlertRule, AlertRuleDocument, AlertType } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistoryDocument, NotificationRecord } from './schemas/alert-history.schema';
import { Sensor, SensorDocument } from '../sensors/sensors.schema';
import { Settings, SettingsDocument } from '../settings/settings.schema';

@Injectable()
export class SensorTimeoutCronService {
  private readonly logger = new Logger(SensorTimeoutCronService.name);
  private readonly sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });
  private readonly snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

  constructor(
    @InjectModel(AlertRule.name) private readonly alertRuleModel: Model<AlertRuleDocument>,
    @InjectModel(AlertHistory.name) private readonly alertHistoryModel: Model<AlertHistoryDocument>,
    @InjectModel(Sensor.name) private readonly sensorModel: Model<SensorDocument>,
    @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  /**
   * Runs every minute to check for sensors that have exceeded their offline timeout
   * and triggers DEVICE_OFFLINE alerts based on configured alert rules.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleSensorTimeoutCheck(): Promise<void> {
    try {
      this.logger.log('🕐 Starting sensor timeout check...');
      const now = new Date();

      // 1. Get all organizations with sensorOfflineTimeOut settings
      const allSettings = await this.settingsModel.find({
        sensorOfflineTimeOut: { $exists: true, $gt: 0 }
      }).lean();

      if (allSettings.length === 0) {
        this.logger.debug('No orgs with sensorOfflineTimeOut configured');
        return;
      }

      this.logger.log(`Found ${allSettings.length} orgs with timeout settings`);

      // 2. Process each organization
      for (const settings of allSettings) {
        await this.processOrgTimeouts(settings.orgId, settings.sensorOfflineTimeOut, now);
      }

      this.logger.log('✅ Sensor timeout check completed');
    } catch (error) {
      this.logger.error('❌ Sensor timeout check failed', error);
    }
  }

  /**
   * Process sensor timeouts for a specific organization
   */
  private async processOrgTimeouts(
    orgId: Types.ObjectId,
    timeoutMinutes: number,
    now: Date
  ): Promise<void> {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - timeoutMs);

    // Find sensors that are currently online but haven't been seen within the timeout period
    const timedOutSensors = await this.sensorModel.find({
      orgId,
      isOnline: true,
      claimed: true,
      lastSeen: { $lt: cutoffTime }
    }).lean();

    if (timedOutSensors.length === 0) {
      return;
    }

    this.logger.log(`Found ${timedOutSensors.length} timed-out sensors for org ${orgId}`);

    // Get sensor IDs for alert rule lookup
    const sensorIds = timedOutSensors.map(s => s._id);

    // Find enabled DEVICE_OFFLINE alert rules for these sensors
    const rules = await this.alertRuleModel.find({
      orgId,
      deviceId: { $in: sensorIds },
      alertType: AlertType.DEVICE_OFFLINE,
      enabled: true
    }).lean();

    if (rules.length === 0) {
      // Still update sensors to offline even if no alert rules
      await this.markSensorsOffline(sensorIds);
      return;
    }

    this.logger.log(`Found ${rules.length} DEVICE_OFFLINE alert rules to evaluate`);

    // Process each rule
    for (const rule of rules) {
      const sensor = timedOutSensors.find(s => s._id === rule.deviceId);
      if (!sensor) continue;

      await this.processAlertRule(rule, sensor, now);
    }

    // Mark all timed-out sensors as offline
    await this.markSensorsOffline(sensorIds);
  }

  /**
   * Process a single alert rule - check throttle, create history, send notifications
   */
  private async processAlertRule(
    rule: any,
    sensor: any,
    timestamp: Date
  ): Promise<void> {
    try {
      // Check throttle
      const throttleMs = (rule.throttleMinutes || 10) * 60 * 1000;
      const recentTrigger = await this.alertHistoryModel.findOne({
        ruleId: rule._id,
        deviceId: sensor._id,
        triggerTime: { $gte: new Date(Date.now() - throttleMs) }
      });

      if (recentTrigger) {
        this.logger.debug(`🔕 Alert throttled for sensor ${sensor._id} (${rule.throttleMinutes}min cooldown)`);
        return;
      }

      this.logger.log(`🚨 Sensor offline alert triggered for ${sensor.displayName || sensor._id}`);

      // Create notification records
      const notifications: NotificationRecord[] = [];

      if (rule.channels.email?.enabled && rule.channels.email?.addresses?.length > 0) {
        for (const recipient of rule.channels.email.addresses) {
          notifications.push({
            channel: 'email',
            recipient,
            success: false,
            timestamp: new Date()
          });
        }
      }

      if (rule.channels.sms?.enabled && rule.channels.sms?.phoneNumbers?.length > 0) {
        for (const phoneNumber of rule.channels.sms.phoneNumbers) {
          notifications.push({
            channel: 'sms',
            recipient: phoneNumber,
            success: false,
            timestamp: new Date()
          });
        }
      }

      // Create alert history record
      const historyDoc = await this.alertHistoryModel.create({
        ruleId: rule._id,
        orgId: rule.orgId,
        deviceId: sensor._id,
        displayName: rule.displayName || sensor.displayName || sensor._id,
        triggerTime: timestamp,
        sensorValue: 0, // 0 for offline
        alertType: AlertType.DEVICE_OFFLINE,
        notifications,
        acknowledged: false,
      });

      // Send notifications
      await this.sendNotifications(rule, sensor, timestamp, historyDoc._id as Types.ObjectId);

      // Update rule stats
      await this.alertRuleModel.updateOne(
        { _id: rule._id },
        {
          $set: { lastTriggeredAt: timestamp },
          $inc: { triggerCount: 1 }
        }
      );

      this.logger.log(`✅ Alert sent for sensor ${sensor.displayName || sensor._id}`);
    } catch (error) {
      this.logger.error(`Failed to process alert rule ${rule._id}`, error);
    }
  }

  /**
   * Mark sensors as offline in the database
   */
  private async markSensorsOffline(sensorIds: string[]): Promise<void> {
    await this.sensorModel.updateMany(
      { _id: { $in: sensorIds } },
      { $set: { isOnline: false } }
    );
    this.logger.log(`Marked ${sensorIds.length} sensors as offline`);
  }

  /**
   * Send email and SMS notifications for an alert
   */
  private async sendNotifications(
    rule: any,
    sensor: any,
    timestamp: Date,
    historyId: Types.ObjectId
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Send emails
    if (rule.channels.email?.enabled && rule.channels.email?.addresses?.length > 0) {
      for (const recipient of rule.channels.email.addresses) {
        promises.push(
          this.sendEmail(rule, sensor, timestamp, recipient)
            .then(async () => {
              this.logger.log(`✉️ Email sent to ${recipient}`);
              await this.alertHistoryModel.updateOne(
                { _id: historyId, 'notifications.recipient': recipient, 'notifications.channel': 'email' },
                { $set: { 'notifications.$.success': true } }
              );
            })
            .catch(async (err) => {
              this.logger.warn(`Failed to send email to ${recipient}`, err);
              await this.alertHistoryModel.updateOne(
                { _id: historyId, 'notifications.recipient': recipient, 'notifications.channel': 'email' },
                { $set: { 'notifications.$.success': false, 'notifications.$.error': err.message } }
              );
            })
        );
      }
    }

    // Send SMS
    if (rule.channels.sms?.enabled && rule.channels.sms?.phoneNumbers?.length > 0) {
      for (const phoneNumber of rule.channels.sms.phoneNumbers) {
        promises.push(
          this.sendSms(rule, sensor, phoneNumber)
            .then(async () => {
              this.logger.log(`📱 SMS sent to ${phoneNumber}`);
              await this.alertHistoryModel.updateOne(
                { _id: historyId, 'notifications.recipient': phoneNumber, 'notifications.channel': 'sms' },
                { $set: { 'notifications.$.success': true } }
              );
            })
            .catch(async (err) => {
              this.logger.warn(`Failed to send SMS to ${phoneNumber}`, err);
              await this.alertHistoryModel.updateOne(
                { _id: historyId, 'notifications.recipient': phoneNumber, 'notifications.channel': 'sms' },
                { $set: { 'notifications.$.success': false, 'notifications.$.error': err.message } }
              );
            })
        );
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send email notification with HTML template (same as lambda.ts)
   */
  private async sendEmail(
    rule: any,
    sensor: any,
    timestamp: Date,
    recipient: string
  ): Promise<string> {
    const subject = `IOT Alert: ${rule.name}`;
    const formattedTime = timestamp.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    const alertIcon = '🔴';
    const alertTitle = 'Sensor Offline (Timeout)';
    const deviceName = rule.displayName || sensor.displayName || sensor._id;

    const alertDetails = `
      <div class="detail-row">
        <div class="detail-label">Sensor:</div>
        <div class="detail-value">${deviceName}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Sensor ID:</div>
        <div class="detail-value">${sensor._id}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Status:</div>
        <div class="detail-value"><strong style="color: #dc3545;">OFFLINE</strong></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Last Seen:</div>
        <div class="detail-value">${sensor.lastSeen ? new Date(sensor.lastSeen).toLocaleString('en-US') : 'Unknown'}</div>
      </div>
    `;

    const conditionContent = `
      <div class="condition-box">
        <div class="label">🔴 Sensor Timeout</div>
        <div class="value">Sensor has not reported data within the configured timeout period</div>
      </div>
    `;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px; }
    .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { background-color: white; padding: 25px; border-radius: 0 0 8px 8px; border-left: 4px solid #ff6b6b; }
    .alert-box { background-color: #fff3cd; border-left: 4px solid #ff6b6b; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .alert-box strong { color: #ff6b6b; }
    .condition-box { background-color: #ffe4e6; border-left: 4px solid #ff6b6b; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .condition-box .label { font-weight: 700; color: #ff6b6b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .condition-box .value { font-size: 18px; font-weight: 600; color: #d32f2f; margin-top: 8px; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #eee; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #555; width: 120px; }
    .detail-value { color: #333; flex: 1; word-break: break-word; }
    .footer { text-align: center; padding-top: 20px; color: #999; font-size: 12px; }
    .button { display: inline-block; background-color: #ff6b6b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 15px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${alertIcon} ${alertTitle}</h1>
    </div>
    <div class="content">
      <div class="alert-box">
        <strong>Alert Rule:</strong> ${rule.name}
      </div>

      ${alertDetails}

      ${conditionContent}

      <div class="detail-row">
        <div class="detail-label">Triggered:</div>
        <div class="detail-value">${formattedTime}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">ISO Timestamp:</div>
        <div class="detail-value" style="font-size: 12px; color: #999;">${timestamp.toISOString()}</div>
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="margin: 15px 0; color: #666;">
        This is an automated alert from your IoT monitoring system. The sensor has stopped reporting data and may need attention.
      </p>
    </div>
    <div class="footer">
      <p>Powered by Motionics IoT Platform</p>
    </div>
  </div>
</body>
</html>
`;

    const command = new SendEmailCommand({
      FromEmailAddress: 'alerts@motionics.com',
      Destination: {
        ToAddresses: [recipient]
      },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: htmlBody }
          }
        }
      }
    });

    const result = await this.sesClient.send(command);
    return result.MessageId || 'unknown';
  }

  /**
   * Send SMS notification (same format as lambda.ts)
   */
  private async sendSms(
    rule: any,
    sensor: any,
    phoneNumber: string
  ): Promise<string> {
    const deviceName = rule.displayName || sensor.displayName || sensor._id;
    const message = `🔴 Alert: ${rule.name}\n${deviceName}: OFFLINE\nSensor has not reported data within timeout period.`;

    this.logger.debug(`Sending SMS to ${phoneNumber}`);
    
    const command = new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message.substring(0, 160) // SMS character limit
    });

    const result = await this.snsClient.send(command);
    return result.MessageId || 'unknown';
  }
}
