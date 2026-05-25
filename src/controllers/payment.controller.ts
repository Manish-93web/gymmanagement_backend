import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Payment from '../models/Payment.model';
import paymentService, { CreatePaymentDTO } from '../services/payment.service';
import { config } from '../config/config';

class PaymentController {
    // POST /
    async createPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { memberId, subscriptionId, amount, paymentType, paymentMethod, description, taxBreakdown } = req.body;

            if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });
            if (amount === undefined) return res.status(400).json({ success: false, message: 'amount is required' });
            if (!paymentType) return res.status(400).json({ success: false, message: 'paymentType is required' });
            if (!paymentMethod) return res.status(400).json({ success: false, message: 'paymentMethod is required' });

            const branchId = req.body.branchId || req.branchId || '';

            const dto: CreatePaymentDTO = {
                tenantId,
                branchId,
                memberId,
                subscriptionId,
                amount: Number(amount),
                paymentType,
                paymentMethod,
                description,
                taxBreakdown,
            };

            const payment = await paymentService.createPayment(dto);
            return res.status(201).json({ success: true, data: payment });
        } catch (error) {
            return next(error);
        }
    }

    // POST /:paymentId/razorpay-order
    async createRazorpayOrder(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { paymentId } = req.params;
            const payment = await Payment.findOne({ _id: paymentId, tenantId });
            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

            const order = await paymentService.createRazorpayOrder(payment.amount.total);
            return res.status(200).json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency } });
        } catch (error) {
            return next(error);
        }
    }

    // POST /:paymentId/stripe-intent
    async createStripeIntent(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { paymentId } = req.params;
            const payment = await Payment.findOne({ _id: paymentId, tenantId });
            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

            const intent = await paymentService.createStripePaymentIntent(payment.amount.total);
            return res.status(200).json({ success: true, data: { clientSecret: intent.client_secret, intentId: intent.id } });
        } catch (error) {
            return next(error);
        }
    }

    // POST /:paymentId/process
    async processPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { paymentId } = req.params;
            const { gateway, gatewayPaymentId, gatewayOrderId } = req.body;

            // For cash/card payments, mark directly as completed
            if (!gateway) {
                const payment = await Payment.findOneAndUpdate(
                    { _id: paymentId, tenantId },
                    { $set: { status: 'completed', paidAt: new Date() } },
                    { new: true }
                );
                if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
                return res.status(200).json({ success: true, data: payment });
            }

            const updated = await paymentService.processPayment({ paymentId: String(paymentId), gateway: gateway as 'razorpay' | 'stripe', gatewayPaymentId: String(gatewayPaymentId), gatewayOrderId: gatewayOrderId ? String(gatewayOrderId) : undefined });
            if (!updated) return res.status(404).json({ success: false, message: 'Payment not found' });
            return res.status(200).json({ success: true, data: updated });
        } catch (error) {
            return next(error);
        }
    }

    // POST /:paymentId/refund
    async processRefund(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { paymentId } = req.params;
            const { amount, reason } = req.body;

            const payment = await Payment.findOne({ _id: paymentId, tenantId });
            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

            const refundAmount = amount ?? payment.amount.total;
            const updated = await paymentService.processRefund(String(paymentId), refundAmount, reason || 'Refund requested');
            return res.status(200).json({ success: true, data: updated });
        } catch (error) {
            return next(error);
        }
    }

    // GET /stats
    async getPaymentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.query.branchId as string | undefined;
            const stats = await paymentService.getPaymentStats(tenantId, branchId);
            return res.status(200).json({ success: true, data: stats });
        } catch (error) {
            return next(error);
        }
    }

    // GET /:paymentId
    async getPaymentById(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { paymentId } = req.params;
            const payment = await Payment.findOne({ _id: paymentId, tenantId })
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .lean();

            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
            return res.status(200).json({ success: true, data: payment });
        } catch (error) {
            return next(error);
        }
    }

    // GET /
    async getPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const {
                branchId,
                memberId,
                status,
                page = '1',
                limit = '20',
            } = req.query;

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);

            const { payments, total } = await paymentService.getPayments(
                tenantId,
                branchId as string,
                memberId as string,
                status as string,
                pageNum,
                limitNum
            );

            return res.status(200).json({
                success: true,
                data: payments,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // POST /checkout
    async getCheckoutDetails(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { planId, couponCode } = req.body;
            if (!planId) return res.status(400).json({ success: false, message: 'planId is required' });

            const MembershipPlan = (await import('../models/MembershipPlan.model')).default;
            const plan = await MembershipPlan.findOne({ _id: planId, tenantId }).lean() as any;
            if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

            let discount = 0;
            let finalPrice = plan.pricing.finalPrice;

            if (couponCode) {
                // Basic coupon validation stub — extend with Coupon model if needed
                discount = 0;
            }

            return res.status(200).json({
                success: true,
                data: {
                    plan,
                    pricing: {
                        basePrice: plan.pricing.basePrice,
                        taxRate: plan.pricing.taxRate,
                        discountPercent: plan.pricing.discountPercent,
                        finalPrice,
                        discount,
                        total: finalPrice - discount,
                    },
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /export
    async exportPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { branchId, memberId, status, from, to } = req.query;
            const filter: any = { tenantId };
            if (branchId) filter.branchId = branchId;
            if (memberId) filter.memberId = memberId;
            if (status) filter.status = status;
            if (from || to) {
                filter.createdAt = {};
                if (from) filter.createdAt.$gte = new Date(from as string);
                if (to) filter.createdAt.$lte = new Date(to as string);
            }

            const payments = await Payment.find(filter)
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .sort({ createdAt: -1 })
                .limit(5000)
                .lean() as any[];

            const rows = [
                ['Invoice #', 'Member', 'Amount', 'Method', 'Status', 'Date'].join(','),
                ...payments.map(p => {
                    const member = p.memberId as any;
                    const name = member ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() : '';
                    return [
                        p.invoiceNumber || '',
                        name,
                        p.amount?.total ?? 0,
                        p.method || '',
                        p.status || '',
                        p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '',
                    ].join(',');
                }),
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="payments-export.csv"');
            return res.send(rows);
        } catch (error) {
            return next(error);
        }
    }

    // POST /webhook/razorpay
    async handleRazorpayWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            const webhookSecret = config.razorpay?.webhookSecret;
            if (webhookSecret) {
                const signature = req.headers['x-razorpay-signature'] as string;
                const rawBody = (req as any).rawBody || JSON.stringify(req.body);
                const expectedSignature = crypto
                    .createHmac('sha256', webhookSecret)
                    .update(rawBody)
                    .digest('hex');
                if (signature !== expectedSignature) {
                    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
                }
            }

            const { event, payload } = req.body;
            if (event === 'payment.captured') {
                const rzPaymentId = payload?.payment?.entity?.id;
                const rzOrderId = payload?.payment?.entity?.order_id;
                if (rzPaymentId) {
                    await Payment.findOneAndUpdate(
                        { 'gateway.orderId': rzOrderId },
                        {
                            $set: {
                                status: 'completed',
                                paidAt: new Date(),
                                'gateway.paymentId': rzPaymentId,
                                'gateway.transactionId': rzPaymentId,
                            },
                        }
                    );
                }
            } else if (event === 'payment.failed') {
                const rzOrderId = payload?.payment?.entity?.order_id;
                const errorDesc = payload?.payment?.entity?.error_description;
                if (rzOrderId) {
                    await Payment.findOneAndUpdate(
                        { 'gateway.orderId': rzOrderId },
                        { $set: { status: 'failed', failedReason: errorDesc } }
                    );
                }
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            return next(error);
        }
    }

    // POST /webhook/stripe
    async handleStripeWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            const webhookSecret = config.stripe?.webhookSecret;
            if (webhookSecret) {
                const sig = req.headers['stripe-signature'] as string;
                const rawBody = (req as any).rawBody || JSON.stringify(req.body);
                const crypto2 = require('crypto');
                const parts = sig?.split(',') ?? [];
                const timestamp = parts.find((p: string) => p.startsWith('t='))?.split('=')[1];
                const expected = crypto2
                    .createHmac('sha256', webhookSecret)
                    .update(`${timestamp}.${rawBody}`)
                    .digest('hex');
                const v1 = parts.find((p: string) => p.startsWith('v1='))?.split('=')[1];
                if (v1 !== expected) {
                    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
                }
            }

            const { type, data } = req.body;
            if (type === 'payment_intent.succeeded') {
                const intentId = data?.object?.id;
                if (intentId) {
                    await Payment.findOneAndUpdate(
                        { 'gateway.orderId': intentId },
                        { $set: { status: 'completed', paidAt: new Date(), 'gateway.transactionId': intentId } }
                    );
                }
            } else if (type === 'payment_intent.payment_failed') {
                const intentId = data?.object?.id;
                const errorMsg = data?.object?.last_payment_error?.message;
                if (intentId) {
                    await Payment.findOneAndUpdate(
                        { 'gateway.orderId': intentId },
                        { $set: { status: 'failed', failedReason: errorMsg } }
                    );
                }
            }

            return res.status(200).json({ received: true });
        } catch (error) {
            return next(error);
        }
    }
}

export default new PaymentController();
