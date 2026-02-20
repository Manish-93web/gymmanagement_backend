import express from 'express';
import { syncHealthData, getHealthSummary } from '../controllers/health.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/sync', requireAnyRole('member', 'trainer', 'staff', 'super_admin'), syncHealthData);
router.get('/summary', requireAnyRole('member', 'trainer', 'branch_manager', 'gym_owner', 'super_admin'), getHealthSummary);

export default router;
