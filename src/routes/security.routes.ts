import { Router } from 'express';
import SecurityController from '../controllers/security.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { adminIPRestriction } from '../middleware/ip-restriction.middleware';

const router = Router();

// Google OAuth routes
router.get('/google/url', SecurityController.getGoogleAuthUrl);
router.post('/google/callback', SecurityController.googleCallback);
router.post('/google/link', authenticate, SecurityController.linkGoogleAccount);
router.delete('/google/unlink', authenticate, SecurityController.unlinkGoogleAccount);

// Custom domain routes (Gym Owner only)
router.post(
    '/domain',
    authenticate,
    requireRole(['gym_owner', 'super_admin']),
    SecurityController.addCustomDomain
);

router.post(
    '/domain/verify',
    authenticate,
    requireRole(['gym_owner', 'super_admin']),
    SecurityController.verifyCustomDomain
);

router.delete(
    '/domain',
    authenticate,
    requireRole(['gym_owner', 'super_admin']),
    SecurityController.removeCustomDomain
);

router.get(
    '/domain/status',
    authenticate,
    requireRole(['gym_owner', 'super_admin']),
    SecurityController.getDomainStatus
);

// Audit log routes (Admin only with IP restriction)
router.get(
    '/audit/logs',
    authenticate,
    adminIPRestriction,
    requireRole(['super_admin', 'gym_owner', 'auditor']),
    SecurityController.getAuditLogs
);

router.get(
    '/audit/statistics',
    authenticate,
    adminIPRestriction,
    requireRole(['super_admin', 'gym_owner']),
    SecurityController.getAuditStatistics
);

router.get(
    '/audit/export',
    authenticate,
    adminIPRestriction,
    requireRole(['super_admin', 'gym_owner', 'auditor']),
    SecurityController.exportAuditLogs
);

export default router;
