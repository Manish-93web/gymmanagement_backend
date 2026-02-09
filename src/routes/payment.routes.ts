import { Router } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create payment
router.post(
    '/',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant']),
    paymentController.createPayment.bind(paymentController)
);

// Create Razorpay order
router.post(
    '/:paymentId/razorpay-order',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant']),
    paymentController.createRazorpayOrder.bind(paymentController)
);

// Create Stripe payment intent
router.post(
    '/:paymentId/stripe-intent',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant']),
    paymentController.createStripeIntent.bind(paymentController)
);

// Process payment
router.post(
    '/:paymentId/process',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant']),
    paymentController.processPayment.bind(paymentController)
);

// Process refund
router.post(
    '/:paymentId/refund',
    requireAnyRole(['gym_owner', 'branch_manager', 'accountant']),
    paymentController.processRefund.bind(paymentController)
);

// Get payment by ID
router.get(
    '/:paymentId',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor']),
    paymentController.getPaymentById.bind(paymentController)
);

// Get all payments
router.get(
    '/',
    requireAnyRole(['gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor']),
    paymentController.getPayments.bind(paymentController)
);

// Get payment statistics
router.get(
    '/stats/summary',
    requireAnyRole(['gym_owner', 'branch_manager', 'accountant', 'auditor']),
    paymentController.getPaymentStats.bind(paymentController)
);

export default router;
