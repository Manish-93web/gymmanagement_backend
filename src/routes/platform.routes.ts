import express from 'express';
import {
    getAllTenants,
    getTenantById,
    updateTenantStatus,
    updateTenant,
    getPlatformMetrics,
    getPlatformConfig,
    updatePlatformConfig,
    getPlatformAuditLogs,
    listBackups,
    triggerBackup,
    getAdmins,
    getAllSupportTickets,
    getSupportTicketById,
    replyToTicket,
    getPlatformPlans,
    createSaaSPlan,
    updateSaaSPlan,
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
    promoteToAdmin,
} from '../controllers/platform.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = express.Router();

// Apply auth and strict role check for ALL routes
router.use(authenticate, requireRole('super_admin'));

router.get('/tenants', getAllTenants);
router.get('/tenants/:tenantId', getTenantById);
router.patch('/tenants/:tenantId', updateTenant);
router.patch('/tenants/:tenantId/status', updateTenantStatus);
router.get('/metrics', getPlatformMetrics);

// Platform Management
router.get('/config', getPlatformConfig);
router.patch('/config', updatePlatformConfig);
router.get('/audit-logs', getPlatformAuditLogs);
router.get('/backups', listBackups);
router.post('/backups/trigger', triggerBackup);

// Admins
router.get('/admins', getAdmins);
router.post('/admins/promote', promoteToAdmin);

// Support tickets — /support/tickets matches frontend calls
router.get('/support', getAllSupportTickets);
router.get('/support/tickets', getAllSupportTickets);
router.get('/support/tickets/:id', getSupportTicketById);
router.post('/support/tickets/:id/reply', replyToTicket);

// SaaS Plans — /saas-plans matches frontend calls
router.get('/plans', getPlatformPlans);
router.get('/saas-plans', getPlatformPlans);
router.post('/saas-plans', createSaaSPlan);
router.patch('/saas-plans/:id', updateSaaSPlan);

// Payments — /saas-payments matches frontend calls
router.get('/payments', getPlatformPayments);
router.get('/saas-payments', getPlatformPayments);

// Backup alias — frontend calls POST /platform/backup
router.post('/backup', triggerBackup);

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
