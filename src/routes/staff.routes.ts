import { Router } from 'express';
import * as staffController from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Staff routes
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffList);
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.createStaffMember);
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffStats);
router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffMember);
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffMember);
router.patch('/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffStatus);

export default router;
