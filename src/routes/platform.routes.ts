import express from 'express';
import {
    getAllTenants,
    getTenantById,
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
    endViewSession,
    getPlatformBranding,
    updatePlatformBranding,
    getPlatformAnalytics,
    getPlatformHealth,
} from '../controllers/platform.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = express.Router();

// Apply auth and strict role check for ALL routes
router.use(authenticate, requireRole('super_admin'));

router.get('/tenants', getAllTenants);
router.get('/tenants/:tenantId', getTenantById);
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
router.delete('/tenants/:tenantId/view-session', endViewSession);

// Platform branding & analytics
router.get('/branding', getPlatformBranding);
router.patch('/branding', updatePlatformBranding);
router.get('/analytics', getPlatformAnalytics);

// Infrastructure health — polled every 30 s by OverviewModule
router.get('/health', getPlatformHealth);

export default router;
