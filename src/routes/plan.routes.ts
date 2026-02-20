import { Router } from 'express';
import planController from '../controllers/plan.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Plan routes
router.post(
    '/plans',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    planController.createPlan.bind(planController)
);

router.get(
    '/plans',
    authenticate,
    planController.getPlans.bind(planController)
);

router.get(
    '/plans/:planId',
    authenticate,
    planController.getPlanById.bind(planController)
);

router.put(
    '/plans/:planId',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    planController.updatePlan.bind(planController)
);

router.delete(
    '/plans/:planId',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    planController.deactivatePlan.bind(planController)
);

// Subscription routes
router.post(
    '/subscriptions',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    planController.createSubscription.bind(planController)
);

router.post(
    '/subscriptions/:subscriptionId/freeze',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    planController.freezeSubscription.bind(planController)
);

router.post(
    '/subscriptions/:subscriptionId/unfreeze',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    planController.unfreezeSubscription.bind(planController)
);

router.post(
    '/subscriptions/:subscriptionId/cancel',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    planController.cancelSubscription.bind(planController)
);

router.post(
    '/subscriptions/:subscriptionId/renew',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    planController.renewSubscription.bind(planController)
);

router.get(
    '/subscriptions/member/:memberId',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'member', 'super_admin'),
    planController.getMemberSubscriptions.bind(planController)
);

export default router;
