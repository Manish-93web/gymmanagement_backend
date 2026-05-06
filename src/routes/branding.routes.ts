import express from 'express';
import brandingController from '../controllers/branding.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = express.Router();

// Public manifest endpoint
router.get('/manifest/:tenantSlug', brandingController.getManifest.bind(brandingController));

// Branding settings — requires auth + tenant context
router.get('/settings', authenticate, tenantContext, brandingController.getBrandingSettings.bind(brandingController));
router.put('/settings', authenticate, tenantContext, requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), brandingController.updateBrandingSettings.bind(brandingController));

export default router;
