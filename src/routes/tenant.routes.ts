import { Router, Request, Response } from 'express';
import tenantController from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireTenantAccess } from '../middleware/rbac.middleware';
import Tenant from '../models/Tenant.model';

const router = Router();

// Super Admin routes
router.post('/', authenticate, requireRole('super_admin'), tenantController.createTenant.bind(tenantController));
router.get('/all', authenticate, requireRole('super_admin'), tenantController.getAllTenants.bind(tenantController));
router.delete('/:tenantId/deactivate', authenticate, requireRole('super_admin'), tenantController.deactivateTenant.bind(tenantController));

// Public routes
router.post('/register', tenantController.createTenant.bind(tenantController));

// Tenant-specific routes (Gym Owner + Super Admin)
router.get('/current', authenticate, tenantController.getCurrentTenant.bind(tenantController));

// Must be before /:tenantId to avoid 'onboarding' being matched as a tenantId param
router.get('/onboarding', authenticate, tenantController.getOnboarding.bind(tenantController));

// GET /manifest — tenant branding manifest (PWA-friendly)
router.get('/manifest', authenticate, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const tenant = await Tenant.findById(tenantId).select('name branding contactInfo').lean();
        if (!tenant) { res.status(404).json({ success: false, message: 'Tenant not found' }); return; }
        const t = tenant as any;
        const name: string = t.name || '';
        res.json({
            success: true,
            data: {
                name,
                short_name: name.split(' ')[0] || name,
                theme_color: t.branding?.primaryColor || '#6366f1',
                background_color: t.branding?.secondaryColor || '#ffffff',
                icon_url: t.branding?.logo || null,
                description: `${name} — Gym Management`,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:tenantId', authenticate, requireTenantAccess, tenantController.getTenant.bind(tenantController));
router.put('/:tenantId', authenticate, requireTenantAccess, requireRole('gym_owner', 'super_admin'), tenantController.updateTenant.bind(tenantController));
router.patch('/:tenantId/features', authenticate, requireTenantAccess, requireRole('gym_owner', 'super_admin'), tenantController.toggleFeature.bind(tenantController));

export default router;
