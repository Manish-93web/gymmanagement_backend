import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);
router.use(requireAnyRole('super_admin'));

router.get('/gyms', adminController.getGyms.bind(adminController));
router.get('/gyms/:gymId', adminController.getGym.bind(adminController));
router.put('/gyms/:gymId', adminController.updateGym.bind(adminController));
router.post('/gyms/:gymId/suspend', adminController.suspendGym.bind(adminController));
router.post('/gyms/:gymId/reactivate', adminController.reactivateGym.bind(adminController));
router.post('/gyms/:gymId/extend-trial', adminController.extendTrial.bind(adminController));
router.post('/gyms/:gymId/change-plan', adminController.changePlan.bind(adminController));
router.post('/gyms/:gymId/add-note', adminController.addNote.bind(adminController));
router.post('/gyms/:gymId/generate-invoice', adminController.generateInvoice.bind(adminController));
router.get('/gyms/:gymId/audit-history', adminController.getAuditHistory.bind(adminController));
router.post('/impersonate', adminController.impersonateGym.bind(adminController));
router.get('/revenue', adminController.getPlatformRevenue.bind(adminController));

// New gym management endpoints
router.post('/gyms/:gymId/convert-trial', adminController.convertTrial.bind(adminController));
router.post('/gyms/:gymId/pause-trial', adminController.pauseTrial.bind(adminController));
router.post('/gyms/:gymId/restart-trial', adminController.restartTrial.bind(adminController));
router.post('/gyms/:gymId/reduce-trial', adminController.reduceTrial.bind(adminController));
router.post('/gyms/:gymId/set-renewal-date', adminController.setRenewalDate.bind(adminController));
router.post('/gyms/:gymId/log-whatsapp', adminController.logWhatsApp.bind(adminController));
router.get('/gyms/:gymId/whatsapp-history', adminController.getWhatsAppHistory.bind(adminController));
router.get('/gyms/:gymId/tickets', adminController.getGymTickets.bind(adminController));

export default router;
