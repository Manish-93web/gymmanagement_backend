import express from 'express';
import {
    getAllTenants,
    updateTenantStatus,
    getPlatformMetrics,
    getPlatformConfig,
    updatePlatformConfig,
    getPlatformAuditLogs,
    listBackups,
    triggerBackup,
    getAdmins,
    getAllSupportTickets,
    getPlatformPlans,
    getPlatformPayments,
    viewTenantMembers,
    viewTenantAttendance,
    viewTenantFinance,
    createViewSession,
    getPlatformBranding,
    updatePlatformBranding,
    getPlatformAnalytics,
} from '../controllers/platform.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = express.Router();

// Apply auth and strict role check for ALL routes
router.use(authenticate, requireRole('super_admin'));

router.get('/tenants', getAllTenants);
router.patch('/tenants/:tenantId/status', updateTenantStatus);
router.get('/metrics', getPlatformMetrics);

// Platform Management
router.get('/config', getPlatformConfig);
router.patch('/config', updatePlatformConfig);
router.get('/audit-logs', getPlatformAuditLogs);
router.get('/backups', listBackups);
router.post('/backups/trigger', triggerBackup);

// New platform routes
router.get('/admins', getAdmins);
router.get('/support', getAllSupportTickets);
router.get('/plans', getPlatformPlans);
router.get('/payments', getPlatformPayments);

// Tenant view routes (impersonation/inspection)
router.get('/tenants/:tenantId/view/members', viewTenantMembers);
router.get('/tenants/:tenantId/view/attendance', viewTenantAttendance);
router.get('/tenants/:tenantId/view/finance', viewTenantFinance);
router.post('/tenants/:tenantId/view-session', createViewSession);

// Platform branding & analytics
router.get('/branding', getPlatformBranding);
router.patch('/branding', updatePlatformBranding);
router.get('/analytics', getPlatformAnalytics);

export default router;
