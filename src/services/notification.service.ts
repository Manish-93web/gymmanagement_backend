import Notification, { INotification } from '../models/Notification.model';
import { config } from '../config/config';

// Note: In production, you would integrate actual email/SMS/WhatsApp services
// For now, this is a placeholder implementation

export interface SendNotificationDTO {
    tenantId: string;
    branchId: string;
    recipientId: string;
    recipientType: 'member' | 'trainer' | 'staff' | 'lead';
    channel: 'email' | 'sms' | 'whatsapp' | 'push';
    templateId?: string;
    subject?: string;
    message: string;
    data?: any;
    scheduledFor?: Date;
}

export class NotificationService {
    // Send notification
    async sendNotification(data: SendNotificationDTO): Promise<INotification> {
        const notification = await Notification.create({
            ...data,
            status: data.scheduledFor ? 'scheduled' : 'pending',
            attempts: [],
        });

        // If not scheduled, send immediately
        if (!data.scheduledFor) {
            await this.processNotification(notification._id.toString(), data.tenantId);
        }

        return notification;
    }

    // Process notification (actual sending)
    async processNotification(notificationId: string, tenantId: string): Promise<INotification | null> {
        const notification = await Notification.findOne({ _id: notificationId, tenantId });

        if (!notification) {
            throw new Error('Notification not found');
        }

        if (notification.status === 'sent') {
            throw new Error('Notification already sent');
        }

        try {
            // Attempt to send based on channel
            let success = false;

            switch (notification.channel) {
                case 'email':
                    success = await this.sendEmail(notification);
                    break;
                case 'sms':
                    success = await this.sendSMS(notification);
                    break;
                case 'whatsapp':
                    success = await this.sendWhatsApp(notification);
                    break;
                case 'push':
                    success = await this.sendPush(notification);
                    break;
            }

            // Update notification status
            return await Notification.findByIdAndUpdate(
                notificationId,
                {
                    $set: {
                        status: success ? 'sent' : 'failed',
                        sentAt: success ? new Date() : undefined,
                    },
                    $push: {
                        attempts: {
                            attemptedAt: new Date(),
                            success,
                            error: success ? undefined : 'Failed to send',
                        },
                    },
                },
                { new: true }
            );
        } catch (error: any) {
            // Update with failure
            return await Notification.findByIdAndUpdate(
                notificationId,
                {
                    $set: { status: 'failed' },
                    $push: {
                        attempts: {
                            attemptedAt: new Date(),
                            success: false,
                            error: error.message,
                        },
                    },
                },
                { new: true }
            );
        }
    }

    // Send email (placeholder)
    private async sendEmail(notification: INotification): Promise<boolean> {
        // In production, integrate with SendGrid, AWS SES, etc.
        console.log(`Sending email to ${notification.recipientId}:`, notification.message);

        // Simulate success
        return true;
    }

    // Send SMS (placeholder)
    private async sendSMS(notification: INotification): Promise<boolean> {
        // In production, integrate with Twilio, AWS SNS, etc.
        console.log(`Sending SMS to ${notification.recipientId}:`, notification.message);

        // Simulate success
        return true;
    }

    // Send WhatsApp (placeholder)
    private async sendWhatsApp(notification: INotification): Promise<boolean> {
        // In production, integrate with WhatsApp Business API
        console.log(`Sending WhatsApp to ${notification.recipientId}:`, notification.message);

        // Simulate success
        return true;
    }

    // Send push notification (placeholder)
    private async sendPush(notification: INotification): Promise<boolean> {
        // In production, integrate with Firebase Cloud Messaging, OneSignal, etc.
        console.log(`Sending push to ${notification.recipientId}:`, notification.message);

        // Simulate success
        return true;
    }

    // Retry failed notification
    async retryNotification(notificationId: string, tenantId: string): Promise<INotification | null> {
        const notification = await Notification.findOne({ _id: notificationId, tenantId });

        if (!notification) {
            throw new Error('Notification not found');
        }

        if (notification.status === 'sent') {
            throw new Error('Notification already sent');
        }

        if (notification.attempts.length >= 3) {
            throw new Error('Maximum retry attempts reached');
        }

        return await this.processNotification(notificationId, tenantId);
    }

    // Get notifications
    async getNotifications(
        tenantId: string,
        recipientId?: string,
        status?: string,
        channel?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ notifications: INotification[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };
        if (recipientId) filter.recipientId = recipientId;
        if (status) filter.status = status;
        if (channel) filter.channel = channel;

        const [notifications, total] = await Promise.all([
            Notification.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
            Notification.countDocuments(filter),
        ]);

        return { notifications, total };
    }

    // Get scheduled notifications
    async getScheduledNotifications(tenantId: string): Promise<INotification[]> {
        return await Notification.find({
            tenantId,
            status: 'scheduled',
            scheduledFor: { $lte: new Date() },
        }).sort({ scheduledFor: 1 });
    }

    // Bulk send notifications
    async bulkSendNotifications(
        tenantId: string,
        recipientIds: string[],
        channel: 'email' | 'sms' | 'whatsapp' | 'push',
        message: string,
        subject?: string
    ): Promise<INotification[]> {
        const notifications = await Promise.all(
            recipientIds.map(recipientId =>
                this.sendNotification({
                    tenantId,
                    branchId: '', // Would be set appropriately
                    recipientId,
                    recipientType: 'member',
                    channel,
                    message,
                    subject,
                })
            )
        );

        return notifications;
    }

    // Get notification statistics
    async getNotificationStats(tenantId: string): Promise<any> {
        const total = await Notification.countDocuments({ tenantId });

        const byStatus = await Notification.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const byChannel = await Notification.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$channel', count: { $sum: 1 } } },
        ]);

        return {
            total,
            byStatus: byStatus.reduce((acc: any, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            byChannel: byChannel.reduce((acc: any, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
        };
    }
}

export default new NotificationService();
