import { Router } from 'express';
import supportController from '../controllers/support.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate, tenantContext);

router.get('/tickets', supportController.getTickets.bind(supportController));
router.post('/tickets', supportController.createTicket.bind(supportController));
router.get('/tickets/stats', supportController.getStats.bind(supportController));
router.get('/tickets/:id', supportController.getTicket.bind(supportController));
router.patch('/tickets/:id', supportController.updateTicket.bind(supportController));

export default router;
