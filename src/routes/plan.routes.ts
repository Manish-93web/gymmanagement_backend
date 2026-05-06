import { Router } from 'express';
import planController from '../controllers/plan.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), planController.createPlan.bind(planController));
router.get('/', planController.getPlans.bind(planController));
router.get('/:planId', planController.getPlanById.bind(planController));
router.put('/:planId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), planController.updatePlan.bind(planController));
router.delete('/:planId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), planController.deactivatePlan.bind(planController));

export default router;
