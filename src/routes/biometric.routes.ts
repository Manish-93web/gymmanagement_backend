import { Router } from 'express';
import biometricController from '../controllers/biometric.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

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
router.get('/devices/:id/logs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getDeviceLogs.bind(biometricController));

// Member enrollment
router.get('/members', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getEnrolledMembers.bind(biometricController));
router.post('/members', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.enrollMember.bind(biometricController));
router.get('/members/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getMemberEnrollment.bind(biometricController));
router.delete('/members/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.removeEnrollment.bind(biometricController));

// Settings
router.get('/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.getSettings.bind(biometricController));
router.put('/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.updateSettings.bind(biometricController));

// Reports
router.get('/reports', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), biometricController.getReports.bind(biometricController));

// Unmatched logs
router.get('/unmatched', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), biometricController.getUnmatchedLogs.bind(biometricController));

export default router;
