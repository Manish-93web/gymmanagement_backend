import { Router } from 'express';
import tenantController from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireTenantAccess } from '../middleware/rbac.middleware';

const router = Router();

// Super Admin routes
router.post('/', authenticate, requireRole('super_admin'), tenantController.createTenant.bind(tenantController));
router.get('/all', authenticate, requireRole('super_admin'), tenantController.getAllTenants.bind(tenantController));
router.delete('/:tenantId/deactivate', authenticate, requireRole('super_admin'), tenantController.deactivateTenant.bind(tenantController));

// Public routes
router.post('/register', tenantController.createTenant.bind(tenantController));

// Tenant-specific routes (Gym Owner + Super Admin)
router.get('/current', authenticate, tenantController.getCurrentTenant.bind(tenantController));

router.get('/:tenantId', authenticate, requireTenantAccess, tenantController.getTenant.bind(tenantController));
router.put('/:tenantId', authenticate, requireTenantAccess, requireRole('gym_owner', 'super_admin'), tenantController.updateTenant.bind(tenantController));
router.patch('/:tenantId/features', authenticate, requireTenantAccess, requireRole('gym_owner', 'super_admin'), tenantController.toggleFeature.bind(tenantController));

export default router;
