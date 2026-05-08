import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import NotificationService from '../services/notification.service';

const sendNotificationSchema = z.object({
    recipientId: z.string(),
    recipientType: z.enum(['member', 'trainer', 'staff', 'lead']),
    channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    message: z.string(),
    templateId: z.string().optional(),
    data: z.record(z.string(), z.any()).optional(),
    scheduledFor: z.string().optional(),
});

const bulkNotificationSchema = z.object({
    recipientIds: z.array(z.string()),
    channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    message: z.string(),
});

export class NotificationController {
    async sendNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = sendNotificationSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';

            const notification = await NotificationService.sendNotification({
                ...validatedData,
                tenantId,
                branchId,
                scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
            });

            return res.status(201).json({
                success: true,
                message: 'Notification sent successfully',
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }

    async sendBulkNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = bulkNotificationSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';

            const notifications = await NotificationService.bulkSendNotifications(
                tenantId,
                validatedData.recipientIds,
                validatedData.channel,
                validatedData.message,
                validatedData.subject
            );

            return res.status(201).json({
                success: true,
                message: `${notifications.length} notifications sent successfully`,
                data: notifications,
            });
        } catch (error) {
            next(error);
        }
    }

    async getNotifications(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { recipientId, status, channel, page, limit } = req.query;

            const result = await NotificationService.getNotifications(
                tenantId,
                recipientId as string,
                status as string,
                channel as string,
                Number(page) || 1,
                Number(limit) || 20
            );

            return res.status(200).json({
                success: true,
                data: result.notifications,
                total: result.total,
            });
        } catch (error) {
            next(error);
        }
    }

    async getNotificationById(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

            // Note: Service doesn't have getNotificationById, using getNotifications with filter
            const result = await NotificationService.getNotifications(tenantId, undefined, undefined, undefined, 1, 1);
            const notification = result.notifications.find(n => n._id.toString() === notificationId);

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found',
                });
            }

            return res.status(200).json({
                success: true,
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }

    async getNotificationStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';

            const stats = await NotificationService.getNotificationStats(tenantId);

            return res.status(200).json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }

    async retryFailedNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params as Record<string, string>;
            const tenantId = (req.user?.tenantId?.toString() || '') as string;

            const notification = await NotificationService.retryNotification(notificationId, tenantId);

            return res.status(200).json({
                success: true,
                message: 'Notification retry initiated',
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }

    async markAsRead(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const Notification = (await import('../models/Notification.model')).default;
            const notification = await Notification.findOneAndUpdate(
                { _id: notificationId, tenantId },
                { $set: { 'delivery.openedAt': new Date() } },
                { new: true }
            );
            if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
            return res.status(200).json({ success: true, data: notification });
        } catch (error) {
            next(error);
        }
    }

    async markAllRead(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { recipientId } = req.body;
            const Notification = (await import('../models/Notification.model')).default;
            const filter: any = { tenantId, 'delivery.openedAt': { $exists: false } };
            if (recipientId) filter.recipientId = recipientId;
            await Notification.updateMany(filter, { $set: { 'delivery.openedAt': new Date() } });
            return res.status(200).json({ success: true, message: 'All notifications marked as read' });
        } catch (error) {
            next(error);
        }
    }

    async deleteNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const Notification = (await import('../models/Notification.model')).default;
            const notification = await Notification.findOneAndDelete({ _id: notificationId, tenantId });
            if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
            return res.status(200).json({ success: true, message: 'Notification deleted' });
        } catch (error) {
            next(error);
        }
    }
}

export default new NotificationController();
