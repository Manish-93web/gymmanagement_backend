import { Router } from 'express';
import whatsappController from '../controllers/whatsapp.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate, tenantContext);

// Mirror of /api/whatsapp — exposed as /api/whatsapp-quick for frontend compatibility
router.get('/logs', whatsappController.getLogs.bind(whatsappController));
router.post('/logs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.saveLog.bind(whatsappController));
router.delete('/logs/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.deleteLog.bind(whatsappController));

// Broadcast campaigns
router.get('/broadcasts', whatsappController.getBroadcasts.bind(whatsappController));
router.post('/broadcasts', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.createBroadcast.bind(whatsappController));
router.patch('/broadcasts/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.updateBroadcast.bind(whatsappController));
router.delete('/broadcasts/:id', requireAnyRole('gym_owner', 'super_admin'), whatsappController.deleteBroadcast.bind(whatsappController));
router.get('/stats', whatsappController.getStats.bind(whatsappController));
router.get('/scheduled', whatsappController.getScheduled.bind(whatsappController));
router.post('/scheduled', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.createScheduled.bind(whatsappController));
router.patch('/scheduled/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.updateScheduled.bind(whatsappController));
router.post('/create-pdf-link', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), whatsappController.createPdfLink.bind(whatsappController));

export default router;
