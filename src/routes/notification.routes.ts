import { Router } from 'express';
import notificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post(
    '/',
    requireRole('gym_owner', 'branch_manager', 'staff'),
    notificationController.sendNotification.bind(notificationController)
);

router.post(
    '/bulk',
    requireRole('gym_owner', 'branch_manager'),
    notificationController.sendBulkNotification.bind(notificationController)
);

router.get(
    '/',
    requireRole('gym_owner', 'branch_manager', 'staff'),
    notificationController.getNotifications.bind(notificationController)
);

router.get(
    '/stats',
    requireRole('gym_owner', 'branch_manager'),
    notificationController.getNotificationStats.bind(notificationController)
);

router.get(
    '/:notificationId',
    requireRole('gym_owner', 'branch_manager', 'staff'),
    notificationController.getNotificationById.bind(notificationController)
);

router.post(
    '/:notificationId/retry',
    requireRole('gym_owner', 'branch_manager'),
    notificationController.retryFailedNotification.bind(notificationController)
);

export default router;
