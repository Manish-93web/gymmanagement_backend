import { Router, Request, Response, NextFunction } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// ─── Webhook routes (NO auth — signature-verified) ───────────────────────────
const captureRawBody = (req: Request, res: Response, next: NextFunction) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => {
        (req as any).rawBody = data;
        try { req.body = JSON.parse(data || '{}'); } catch { req.body = {}; }
        next();
    });
};

router.post('/webhook/razorpay', captureRawBody, paymentController.handleRazorpayWebhook.bind(paymentController));
router.post('/webhook/stripe', captureRawBody, paymentController.handleStripeWebhook.bind(paymentController));

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.use(authenticate);


// Create payment
router.post(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createPayment.bind(paymentController)
);

// Create Razorpay order
router.post(
    '/:paymentId/razorpay-order',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createRazorpayOrder.bind(paymentController)
);

// Create Stripe payment intent
router.post(
    '/:paymentId/stripe-intent',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createStripeIntent.bind(paymentController)
);

// Process payment
router.post(
    '/:paymentId/process',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.processPayment.bind(paymentController)
);

// Process refund
router.post(
    '/:paymentId/refund',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    paymentController.processRefund.bind(paymentController)
);

// Get payment statistics
router.get(
    '/stats',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPaymentStats.bind(paymentController)
);

// Get payment by ID
router.get(
    '/:paymentId',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPaymentById.bind(paymentController)
);

// Get all payments
router.get(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPayments.bind(paymentController)
);

// Checkout endpoint
router.post(
    '/checkout',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'accountant', 'super_admin'),
    paymentController.getCheckoutDetails.bind(paymentController)
);

// Export payments
router.get(
    '/export',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'),
    paymentController.exportPayments.bind(paymentController)
);

export default router;
