import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './notifications.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  /**
   * Get paginated notification history for organization
   * GET /api/:orgId/notifications/history?page=1&limit=20&read=false
   */
  async getHistory(
    orgId: string,
    page: number = 1,
    limit: number = 20,
    read?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const filter: any = {
      orgId: new Types.ObjectId(orgId),
    };

    if (read !== undefined) {
      filter.read = read;
    }

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('recipientUserId', 'email name')
        .lean(),
      this.notificationModel.countDocuments(filter),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get recent notifications for organization
   * GET /api/:orgId/notifications/recent?limit=5
   */
  async getRecent(orgId: string, limit: number = 5) {
    // Ensure limit is between 1 and 50
    const normalizedLimit = Math.min(Math.max(limit, 1), 50);

    const notifications = await this.notificationModel
      .find({
        orgId: new Types.ObjectId(orgId),
      })
      .sort({ createdAt: -1 })
      .limit(normalizedLimit)
      .populate('recipientUserId', 'email name')
      .lean();

    return {
      data: notifications,
      count: notifications.length,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, orgId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      {
        _id: notificationId,
        orgId: new Types.ObjectId(orgId),
      },
      { read: true },
      { new: true },
    );

    return notification;
  }

  /**
   * Mark all notifications as read for organization
   */
  async markAllAsRead(orgId: string) {
    const result = await this.notificationModel.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        read: false,
      },
      { read: true },
    );

    return {
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(orgId: string) {
    const count = await this.notificationModel.countDocuments({
      orgId: new Types.ObjectId(orgId),
      read: false,
    });

    return { unreadCount: count };
  }

  /**
   * Create notification (internal use)
   */
  async create(
    orgId: string,
    kind: string,
    message: string,
    recipientUserId?: string,
  ): Promise<NotificationDocument> {
    return this.notificationModel.create({
      orgId: new Types.ObjectId(orgId),
      recipientUserId: recipientUserId
        ? new Types.ObjectId(recipientUserId)
        : null,
      kind,
      message,
      read: false,
    });
  }
}

