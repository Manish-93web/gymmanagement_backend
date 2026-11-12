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
    getMenuRegistry,
    getTenantMenuPermissions,
    updateTenantMenuPermissions,
    recordTenantPayment,
} from '../controllers/platform.controller';
import platformLeadController from '../controllers/platform-lead.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = express.Router();

// Apply auth and strict role check for ALL routes
router.use(authenticate, requireRole('super_admin', 'platform_admin'));

// Website leads (gym owners asking to be contacted)
router.get('/leads', platformLeadController.list.bind(platformLeadController));
router.patch('/leads/:id', platformLeadController.update.bind(platformLeadController));
router.delete('/leads/:id', platformLeadController.remove.bind(platformLeadController));

router.get('/tenants', getAllTenants);
router.get('/tenants/:tenantId', getTenantById);
router.patch('/tenants/:tenantId', updateTenant);
router.patch('/tenants/:tenantId/status', updateTenantStatus);
router.get('/metrics', getPlatformMetrics);

// Per-tenant sidebar/drawer menu permissions
router.get('/menu-registry', getMenuRegistry);
router.get('/tenants/:tenantId/menu-permissions', getTenantMenuPermissions);
router.patch('/tenants/:tenantId/menu-permissions', updateTenantMenuPermissions);

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
router.post('/tenants/:tenantId/payments', recordTenantPayment);

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
