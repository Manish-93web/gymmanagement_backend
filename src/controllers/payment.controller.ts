import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import PaymentService from '../services/payment.service';
import logger from '../config/logger';

// Validation schemas
const createPaymentSchema = z.object({
    memberId: z.string(),
    subscriptionId: z.string().optional(),
    paymentType: z.enum(['subscription', 'renewal', 'addon', 'pos', 'penalty']),
    amount: z.number().positive(),
    taxAmount: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    paymentMethod: z.enum(['cash', 'card', 'upi', 'razorpay', 'stripe']),
    paymentGateway: z.enum(['razorpay', 'stripe']).optional(),
});

const processPaymentSchema = z.object({
    gatewayPaymentId: z.string(),
    gatewayOrderId: z.string().optional(),
});

const refundSchema = z.object({
    reason: z.string(),
    amount: z.number().positive().optional(),
});

const checkoutSchema = z.object({
    planId: z.string(),
    couponCode: z.string().optional(),
    durationValue: z.number().optional(),
    familyMemberCount: z.number().optional(),
    addOnIds: z.array(z.string()).optional(),
    applyProRata: z.boolean().optional(),
});

export class PaymentController {
    // Create payment
    async createPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createPaymentSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString();

            const payment = await PaymentService.createPayment({
                ...validatedData,
                paymentType: validatedData.paymentType === 'addon' ? 'addon' : validatedData.paymentType as any,
                tenantId,
                branchId: branchId || '',
            });

            res.status(201).json({
                success: true,
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    // Create Razorpay order
    async createRazorpayOrder(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const payment = await PaymentService.getPaymentById(paymentId, tenantId);
            if (!payment) {
                return res.status(404).json({ success: false, message: 'Payment not found' });
            }

            const order = await PaymentService.createRazorpayOrder(payment.amount.total);

            res.status(200).json({
                success: true,
                data: order,
            });
        } catch (error) {
            next(error);
        }
    }

    // Create Stripe payment intent
    async createStripeIntent(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const payment = await PaymentService.getPaymentById(paymentId, tenantId);
            if (!payment) {
                return res.status(404).json({ success: false, message: 'Payment not found' });
            }

            const intent = await PaymentService.createStripePaymentIntent(payment.amount.total);

            res.status(200).json({
                success: true,
                data: intent,
            });
        } catch (error) {
            next(error);
        }
    }

    // Process payment
    async processPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId } = req.params as Record<string, string>;
            const validatedData = processPaymentSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();

            const paymentDetails = await PaymentService.getPaymentById(paymentId, tenantId);
            if (!paymentDetails) {
                return res.status(404).json({ success: false, message: 'Payment not found' });
            }

            const payment = await PaymentService.processPayment({
                paymentId,
                gateway: paymentDetails.method === 'razorpay' ? 'razorpay' : 'stripe',
                gatewayPaymentId: validatedData.gatewayPaymentId,
                gatewayOrderId: validatedData.gatewayOrderId,
            });

            res.status(200).json({
                success: true,
                message: 'Payment processed successfully',
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    // Process refund
    async processRefund(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId } = req.params as Record<string, string>;
            const validatedData = refundSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();

            const payment = await PaymentService.processRefund(
                paymentId,
                validatedData.amount || 0,
                validatedData.reason
            );

            res.status(200).json({
                success: true,
                message: 'Refund processed successfully',
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get payment by ID
    async getPaymentById(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const payment = await PaymentService.getPaymentById(paymentId, tenantId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found',
                });
            }

            return res.status(200).json({
                success: true,
                data: payment,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get payments
    async getPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { memberId, status, branchId } = req.query;

            const payments = await PaymentService.getPayments(
                tenantId,
                memberId as string,
                status as any,
                branchId as string
            );

            res.status(200).json({
                success: true,
                data: payments,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get payment statistics
    async getPaymentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { branchId } = req.query;

            const stats = await PaymentService.getPaymentStats(tenantId, branchId as string);

            res.status(200).json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
    // Get checkout details (pricing breakdown)
    async getCheckoutDetails(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = checkoutSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();
            const memberId = req.user!.role === 'member' ? req.user!._id.toString() : req.body.memberId;

            const pricingService = (await import('../services/pricing.service')).default;
            const planService = (await import('../services/plan.service')).default;

            const checkoutDetails = await pricingService.calculateFinalPrice({
                ...validatedData,
                tenantId,
                memberId: memberId || req.user!._id.toString(),
            });

            // Calculate pro-rata if requested and member has active sub
            if (validatedData.applyProRata && memberId) {
                const activeSub = await (await import('../models/Subscription.model')).default.findOne({
                    memberId,
                    tenantId,
                    status: 'active'
                });

                if (activeSub) {
                    const proRataCredit = await planService.calculateProRata(activeSub._id.toString(), tenantId);
                    checkoutDetails.proRataCredit = proRataCredit;
                    checkoutDetails.finalPrice = Math.max(0, checkoutDetails.finalPrice - proRataCredit);
                }
            }

            res.status(200).json({
                success: true,
                data: checkoutDetails,
            });
        } catch (error) {
            next(error);
        }
    }

    async exportPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { startDate, endDate, status } = req.query;
            const query: any = { tenantId };
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate as string);
                if (endDate) query.createdAt.$lte = new Date(endDate as string);
            }
            if (status) query.status = status;
            const Payment = (await import('../models/Payment.model')).default;
            const payments = await Payment.find(query)
                .populate('memberId', 'firstName lastName membershipNumber email mobile')
                .sort({ createdAt: -1 })
                .limit(5000);
            return res.status(200).json({ success: true, data: payments });
        } catch (error) { next(error); }
    }

    /**
     * Handle Razorpay webhook
     * POST /api/payments/webhook/razorpay
     * No authentication — verified via HMAC signature
     */
    async handleRazorpayWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            const signature = req.headers['x-razorpay-signature'] as string;
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';

            if (!signature) {
                return res.status(400).json({ success: false, message: 'Missing signature' });
            }

            // Verify HMAC-SHA256 signature
            const rawBody = (req as any).rawBody as string;
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(rawBody)
                .digest('hex');

            if (expectedSignature !== signature) {
                logger.warn('Razorpay webhook: invalid signature');
                return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
            }

            const event = req.body;
            logger.info('Razorpay webhook received', { event: event.event });

            if (event.event === 'payment.captured') {
                const razorpayPaymentId: string = event.payload?.payment?.entity?.id;
                const razorpayOrderId: string = event.payload?.payment?.entity?.order_id;

                if (razorpayPaymentId) {
                    await PaymentService.processPayment({
                        paymentId: razorpayOrderId || razorpayPaymentId,
                        gateway: 'razorpay',
                        gatewayPaymentId: razorpayPaymentId,
                        gatewayOrderId: razorpayOrderId,
                    }).catch((err) => {
                        logger.error('Failed to process Razorpay webhook payment', { err: err.message });
                    });
                }
            }

            res.status(200).json({ received: true });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Handle Stripe webhook
     * POST /api/payments/webhook/stripe
     * No authentication — verified via Stripe-Signature header
     */
    async handleStripeWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            const signature = req.headers['stripe-signature'] as string;
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

            if (!signature) {
                return res.status(400).json({ success: false, message: 'Missing Stripe-Signature header' });
            }

            // Verify Stripe signature (timestamp + payload)
            const rawBody = (req as any).rawBody as string;
            const parts = signature.split(',');
            const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1] || '';
            const stripeSignature = parts.find(p => p.startsWith('v1='))?.split('=')[1] || '';

            const signedPayload = `${timestamp}.${rawBody}`;
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(signedPayload)
                .digest('hex');

            if (expectedSignature !== stripeSignature) {
                logger.warn('Stripe webhook: invalid signature');
                return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
            }

            const event = req.body;
            logger.info('Stripe webhook received', { type: event.type });

            if (event.type === 'payment_intent.succeeded') {
                const paymentIntentId: string = event.data?.object?.id;
                if (paymentIntentId) {
                    await PaymentService.processPayment({
                        paymentId: paymentIntentId,
                        gateway: 'stripe',
                        gatewayPaymentId: paymentIntentId,
                    }).catch((err) => {
                        logger.error('Failed to process Stripe webhook payment', { err: err.message });
                    });
                }
            }

            res.status(200).json({ received: true });
        } catch (error) {
            next(error);
        }
    }
}

export default new PaymentController();

