import { Router } from 'express';
import subscriptionController from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), subscriptionController.getSubscriptions.bind(subscriptionController));
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), subscriptionController.createSubscription.bind(subscriptionController));
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), subscriptionController.getSubscriptionStats.bind(subscriptionController));
router.get('/member/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'member', 'super_admin'), subscriptionController.getMemberSubscriptions.bind(subscriptionController));
router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), subscriptionController.getSubscription.bind(subscriptionController));
router.get('/:id/history', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.getSubscriptionHistory.bind(subscriptionController));
router.post('/:id/cancel', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.cancelSubscription.bind(subscriptionController));
router.post('/:id/freeze', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.freezeSubscription.bind(subscriptionController));
router.post('/:id/unfreeze', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.unfreezeSubscription.bind(subscriptionController));
router.post('/:id/renew', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), subscriptionController.renewSubscription.bind(subscriptionController));

export default router;
