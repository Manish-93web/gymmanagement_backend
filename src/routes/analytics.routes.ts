import { Router } from 'express';
import analyticsController from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { cacheMiddleware } from '../middleware/cache.middleware';

const ANALYTICS_CACHE_TTL = 10 * 60; // 10 minutes

const router = Router();

router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'));

router.get('/revenue', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getRevenueAnalytics.bind(analyticsController));
router.get('/retention', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getRetentionAnalytics.bind(analyticsController));
router.get('/attendance', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getAttendanceAnalytics.bind(analyticsController));
router.get('/class-utilization', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getClassUtilization.bind(analyticsController));
router.get('/trainer-productivity', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getTrainerProductivity.bind(analyticsController));
router.get('/dashboard', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getDashboardOverview.bind(analyticsController));
router.get('/engagement', cacheMiddleware(ANALYTICS_CACHE_TTL), analyticsController.getEngagementAnalytics.bind(analyticsController));
router.get('/export/:name', analyticsController.exportAnalytics.bind(analyticsController));

export default router;
