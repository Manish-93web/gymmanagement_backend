import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get(
    '/overview',
    requireRole('gym_owner', 'branch_manager'),
    dashboardController.getOverview.bind(dashboardController)
);

router.get(
    '/member',
    requireRole('member'),
    dashboardController.getMemberDashboard.bind(dashboardController)
);

router.get(
    '/member/:memberId',
    requireRole('gym_owner', 'branch_manager', 'staff', 'trainer'),
    dashboardController.getMemberDashboard.bind(dashboardController)
);

router.get(
    '/trainer',
    requireRole('trainer'),
    dashboardController.getTrainerDashboard.bind(dashboardController)
);

export default router;
