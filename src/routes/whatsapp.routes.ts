import { Router } from 'express';
import whatsappController from '../controllers/whatsapp.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate, tenantContext);

router.get('/scheduled', whatsappController.getScheduled.bind(whatsappController));
router.post('/scheduled', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.createScheduled.bind(whatsappController));
router.get('/scheduled/:id', whatsappController.getScheduledById.bind(whatsappController));
router.put('/scheduled/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.updateScheduled.bind(whatsappController));
router.delete('/scheduled/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.deleteScheduled.bind(whatsappController));
router.get('/stats', whatsappController.getStats.bind(whatsappController));
router.get('/logs', whatsappController.getLogs.bind(whatsappController));
router.post('/create-pdf-link', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), whatsappController.createPdfLink.bind(whatsappController));
router.post('/send-bulk', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.sendBulk.bind(whatsappController));

// Broadcast campaigns (WhatsAppScheduled — segment-type records)
router.get('/broadcasts', whatsappController.getBroadcasts.bind(whatsappController));
router.post('/broadcasts', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.createBroadcast.bind(whatsappController));
router.patch('/broadcasts/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.updateBroadcast.bind(whatsappController));
router.delete('/broadcasts/:id', requireAnyRole('gym_owner', 'super_admin'), whatsappController.deleteBroadcast.bind(whatsappController));

export default router;
