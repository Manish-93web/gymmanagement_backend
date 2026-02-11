import { Router } from 'express';
import analyticsController from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor'));

router.get('/revenue', analyticsController.getRevenueAnalytics.bind(analyticsController));
router.get('/retention', analyticsController.getRetentionAnalytics.bind(analyticsController));
router.get('/attendance', analyticsController.getAttendanceAnalytics.bind(analyticsController));
router.get('/class-utilization', analyticsController.getClassUtilization.bind(analyticsController));
router.get('/trainer-productivity', analyticsController.getTrainerProductivity.bind(analyticsController));
router.get('/dashboard', analyticsController.getDashboardOverview.bind(analyticsController));

export default router;
