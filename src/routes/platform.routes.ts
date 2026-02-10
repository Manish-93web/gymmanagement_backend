import express from 'express';
import { getAllTenants, updateTenantStatus, getPlatformMetrics } from '../controllers/platform.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = express.Router();

// Apply auth and strict role check for ALL routes
router.use(authenticate, requireRole(['super_admin']));

router.get('/tenants', getAllTenants);
router.patch('/tenants/:tenantId/status', updateTenantStatus);
router.get('/metrics', getPlatformMetrics);

export default router;
