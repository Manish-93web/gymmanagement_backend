import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import NotificationService from '../services/notification.service';

const sendNotificationSchema = z.object({
    recipientId: z.string(),
    type: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    message: z.string(),
    templateId: z.string().optional(),
    templateVariables: z.record(z.any()).optional(),
    scheduledFor: z.string().optional(),
});

const bulkNotificationSchema = z.object({
    recipientIds: z.array(z.string()),
    type: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    message: z.string(),
    templateId: z.string().optional(),
    templateVariables: z.record(z.any()).optional(),
});

export class NotificationController {
    async sendNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = sendNotificationSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString();

            const notification = await NotificationService.sendNotification({
                ...validatedData,
                tenantId,
                branchId: branchId || '',
                scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
            });

            res.status(201).json({
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
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString();

            const notifications = await NotificationService.sendBulkNotification({
                ...validatedData,
                tenantId,
                branchId: branchId || '',
            });

            res.status(201).json({
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
            const tenantId = req.user!.tenantId.toString();
            const { recipientId, type, status } = req.query;

            const notifications = await NotificationService.getNotifications(
                tenantId,
                recipientId as string,
                type as any,
                status as any
            );

            res.status(200).json({
                success: true,
                data: notifications,
            });
        } catch (error) {
            next(error);
        }
    }

    async getNotificationById(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const notification = await NotificationService.getNotificationById(notificationId, tenantId);

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found',
                });
            }

            res.status(200).json({
                success: true,
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }

    async getNotificationStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, startDate, endDate } = req.query;

            const stats = await NotificationService.getNotificationStats(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }

    async retryFailedNotification(req: Request, res: Response, next: NextFunction) {
        try {
            const { notificationId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const notification = await NotificationService.retryNotification(notificationId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Notification retry initiated',
                data: notification,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new NotificationController();
