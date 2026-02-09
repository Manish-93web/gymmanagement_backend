import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import PaymentService from '../services/payment.service';

// Validation schemas
const createPaymentSchema = z.object({
    memberId: z.string(),
    subscriptionId: z.string().optional(),
    paymentType: z.enum(['subscription', 'renewal', 'add_on', 'pos', 'penalty']),
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

export class PaymentController {
    // Create payment
    async createPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createPaymentSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString();

            const payment = await PaymentService.createPayment({
                ...validatedData,
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
            const { paymentId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const order = await PaymentService.createRazorpayOrder(paymentId, tenantId);

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
            const { paymentId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const intent = await PaymentService.createStripePaymentIntent(paymentId, tenantId);

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
            const { paymentId } = req.params;
            const validatedData = processPaymentSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();

            const payment = await PaymentService.processPayment(
                paymentId,
                validatedData.gatewayPaymentId,
                validatedData.gatewayOrderId,
                tenantId
            );

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
            const { paymentId } = req.params;
            const validatedData = refundSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();

            const payment = await PaymentService.processRefund(
                paymentId,
                validatedData.reason,
                tenantId,
                validatedData.amount
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
            const { paymentId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const payment = await PaymentService.getPaymentById(paymentId, tenantId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found',
                });
            }

            res.status(200).json({
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
            const tenantId = req.user!.tenantId.toString();
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
            const tenantId = req.user!.tenantId.toString();
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
}

export default new PaymentController();
