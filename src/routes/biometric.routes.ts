import { Router, Request, Response } from 'express';
import biometricController from '../controllers/biometric.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import BiometricSyncJob from '../models/BiometricSyncJob.model';

const router = Router();

// Webhook — no auth (device-to-server)
router.post('/webhook', biometricController.handleWebhook.bind(biometricController));

// All other routes require auth + tenant context
router.use(authenticate, tenantContext);

// Devices
router.get('/devices', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getDevices.bind(biometricController));
router.post('/devices', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.addDevice.bind(biometricController));
router.get('/devices/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getDevice.bind(biometricController));
router.put('/devices/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.updateDevice.bind(biometricController));
router.delete('/devices/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.deleteDevice.bind(biometricController));
router.post('/devices/:id/test', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.testDevice.bind(biometricController));
router.post('/devices/:id/sync', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.syncDevice.bind(biometricController));
router.post('/devices/:id/reset-cursor', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.resetSyncCursor.bind(biometricController));
router.get('/devices/:id/logs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getDeviceLogs.bind(biometricController));

// Member enrollment
router.get('/members', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getEnrolledMembers.bind(biometricController));
router.post('/members', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.enrollMember.bind(biometricController));
router.get('/members/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getMemberEnrollment.bind(biometricController));
router.put('/members/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.updateMemberBiometric.bind(biometricController));
router.patch('/members/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.updateMemberBiometric.bind(biometricController));
router.delete('/members/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.removeEnrollment.bind(biometricController));

// Settings
router.get('/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.getSettings.bind(biometricController));
router.put('/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.updateSettings.bind(biometricController));

// Reports
router.get('/reports', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.getReports.bind(biometricController));

// Unmatched logs
router.get('/unmatched', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getUnmatchedLogs.bind(biometricController));

// Diagnostic + simulate punch (dev/ops tooling)
router.get('/diagnostic', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.getDiagnostic.bind(biometricController));
router.post('/simulate-punch', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.simulatePunch.bind(biometricController));

// Sync jobs history
router.get('/sync-jobs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const deviceId = req.query.deviceId as string | undefined;
        const query: any = { tenantId };
        if (deviceId) query.deviceId = deviceId;
        const jobs = await BiometricSyncJob.find(query)
            .populate('deviceId', 'name deviceId location')
            .sort({ startedAt: -1 })
            .limit(limit);
        res.json({ success: true, data: { jobs, total: jobs.length } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
