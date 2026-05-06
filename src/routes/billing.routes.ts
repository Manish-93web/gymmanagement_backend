import { Router } from 'express';
import billingController from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/my-invoices', billingController.getMyInvoices.bind(billingController));
router.get('/payments', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'), billingController.getPaymentHistory.bind(billingController));
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), billingController.getPaymentStats.bind(billingController));
router.get('/invoices/:paymentId', billingController.getInvoiceById.bind(billingController));
router.get('/invoices/:paymentId/download', billingController.downloadInvoice.bind(billingController));
router.get('/whatsapp-usage', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), billingController.getWhatsAppUsage.bind(billingController));

export default router;
