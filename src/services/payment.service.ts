import Razorpay from 'razorpay';
import Stripe from 'stripe';
import Payment, { IPayment } from '../models/Payment.model';
import Subscription from '../models/Subscription.model';
import { config } from '../config/config';
import { generateInvoiceNumber } from '../utils/helpers.utils';
import mongoose from 'mongoose';

// Service-level variables (will be initialized lazily)
let razorpayInstance: Razorpay | null = null;
let stripeInstance: Stripe | null = null;

const getRazorpay = () => {
    if (!razorpayInstance) {
        if (!config.razorpay.keyId) {
            console.warn('⚠️ Razorpay credentials missing');
            return null;
        }
        razorpayInstance = new Razorpay({
            key_id: config.razorpay.keyId,
            key_secret: config.razorpay.keySecret,
        });
    }
    return razorpayInstance;
};

const getStripe = () => {
    if (!stripeInstance) {
        if (!config.stripe.secretKey) {
            console.warn('⚠️ Stripe credentials missing');
            return null;
        }
        stripeInstance = new Stripe(config.stripe.secretKey, {
            apiVersion: '2023-10-16' as any,
        });
    }
    return stripeInstance;
};
console.log('DEBUG: PaymentService variables defined (lazy)');

export interface CreatePaymentDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    subscriptionId?: string;
    amount: number;
    paymentType: 'subscription' | 'renewal' | 'addon' | 'pos' | 'penalty';
    paymentMethod: 'razorpay' | 'stripe' | 'cash' | 'card' | 'upi';
    description?: string;
    taxBreakdown?: {
        cgst?: number;
        sgst?: number;
        igst?: number;
    };
}

export interface ProcessPaymentDTO {
    paymentId: string;
    gateway: 'razorpay' | 'stripe';
    gatewayPaymentId: string;
    gatewayOrderId?: string;
}

export class PaymentService {
    // Create payment record
    async createPayment(data: CreatePaymentDTO): Promise<IPayment> {
        const invoiceNumber = generateInvoiceNumber(data.tenantId, 'INV');

        // Calculate tax
        const taxAmount = data.taxBreakdown
            ? (data.taxBreakdown.cgst || 0) + (data.taxBreakdown.sgst || 0) + (data.taxBreakdown.igst || 0)
            : 0;

        const payment = await Payment.create({
            tenantId: data.tenantId,
            branchId: data.branchId,
            memberId: data.memberId,
            userId: data.memberId, // Alias
            subscriptionId: data.subscriptionId,
            type: data.paymentType,
            method: data.paymentMethod,
            invoiceNumber,
            amount: {
                subtotal: data.amount,
                taxAmount,
                discountAmount: 0,
                total: data.amount + taxAmount,
            },
            status: 'pending',
            metadata: {
                description: data.description,
                items: [],
            },
        });

        return payment;
    }

    // Create Razorpay order
    async createRazorpayOrder(amount: number, currency: string = 'INR'): Promise<any> {
        const rz = getRazorpay();
        if (!rz) throw new Error('Razorpay is not configured');
        try {
            const order = await rz.orders.create({
                amount: amount * 100, // Convert to paise
                currency,
                receipt: `receipt_${Date.now()}`,
            });

            return order;
        } catch (error) {
            console.error('Razorpay order creation failed:', error);
            throw new Error('Failed to create Razorpay order');
        }
    }

    // Create Stripe payment intent
    async createStripePaymentIntent(amount: number, currency: string = 'usd'): Promise<any> {
        const st = getStripe();
        if (!st) throw new Error('Stripe is not configured');
        try {
            const paymentIntent = await st.paymentIntents.create({
                amount: amount * 100, // Convert to cents
                currency,
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            return paymentIntent;
        } catch (error) {
            console.error('Stripe payment intent creation failed:', error);
            throw new Error('Failed to create Stripe payment intent');
        }
    }

    // Process payment (mark as completed)
    async processPayment(data: ProcessPaymentDTO): Promise<IPayment | null> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const payment = await Payment.findByIdAndUpdate(
                data.paymentId,
                {
                    $set: {
                        status: 'completed',
                        gateway: {
                            provider: data.gateway,
                            paymentId: data.gatewayPaymentId,
                            orderId: data.gatewayOrderId || '',
                            transactionId: data.gatewayPaymentId
                        },
                        paidAt: new Date(),
                    },
                },
                { new: true, session }
            );

            if (!payment) {
                throw new Error('Payment not found');
            }

            // Update subscription if payment is for subscription/renewal
            if (payment.subscriptionId && (payment.paymentType === 'subscription' || payment.paymentType === 'renewal')) {
                await Subscription.findByIdAndUpdate(
                    payment.subscriptionId,
                    {
                        $set: { status: 'active' },
                        $push: {
                            renewalHistory: {
                                date: new Date(),
                                amount: payment.amount.total,
                                paymentId: payment._id,
                            },
                        },
                    },
                    { session }
                );
            }

            await session.commitTransaction();
            return payment;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Mark payment as failed
    async markPaymentFailed(paymentId: string, errorMessage: string): Promise<IPayment | null> {
        return await Payment.findByIdAndUpdate(
            paymentId,
            {
                $set: {
                    status: 'failed',
                    failedReason: errorMessage,
                },
            },
            { new: true }
        );
    }

    // Process refund
    async processRefund(
        paymentId: string,
        refundAmount: number,
        reason: string
    ): Promise<IPayment | null> {
        const payment = await Payment.findById(paymentId);

        if (!payment) {
            throw new Error('Payment not found');
        }

        if (payment.status !== 'completed') {
            throw new Error('Can only refund completed payments');
        }

        // Process refund with gateway
        if (payment.gateway?.provider === 'razorpay' && payment.gateway.paymentId) {
            const rz = getRazorpay();
            if (!rz) throw new Error('Razorpay is not configured');
            try {
                await rz.payments.refund(payment.gateway.paymentId, {
                    amount: refundAmount * 100,
                });
            } catch (error) {
                console.error('Razorpay refund failed:', error);
                throw new Error('Failed to process Razorpay refund');
            }
        } else if (payment.gateway?.provider === 'stripe' && payment.gateway.paymentId) {
            const st = getStripe();
            if (!st) throw new Error('Stripe is not configured');
            try {
                await st.refunds.create({
                    payment_intent: payment.gateway.paymentId,
                    amount: refundAmount * 100,
                });
            } catch (error) {
                console.error('Stripe refund failed:', error);
                throw new Error('Failed to process Stripe refund');
            }
        }

        // Update payment record
        return await Payment.findByIdAndUpdate(
            paymentId,
            {
                $set: {
                    status: 'refunded',
                    refund: {
                        amount: refundAmount,
                        reason,
                        refundedAt: new Date(),
                    },
                },
            },
            { new: true }
        );
    }

    // Get payment by ID
    async getPaymentById(paymentId: string, tenantId: string): Promise<IPayment | null> {
        return await Payment.findOne({ _id: paymentId, tenantId });
    }

    // Get payments with filters
    async getPayments(
        tenantId: string,
        branchId?: string,
        memberId?: string,
        status?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ payments: IPayment[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;
        if (memberId) filter.memberId = memberId;
        if (status) filter.status = status;

        const [payments, total] = await Promise.all([
            Payment.find(filter)
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            Payment.countDocuments(filter),
        ]);

        return { payments, total };
    }

    // Get payment statistics
    async getPaymentStats(tenantId: string, branchId?: string): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const stats = await Payment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount.total' },
                },
            },
        ]);

        const total = await Payment.countDocuments(filter);
        const totalRevenue = await Payment.aggregate([
            { $match: { ...filter, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount.total' } } },
        ]);

        return {
            total,
            totalRevenue: totalRevenue[0]?.total || 0,
            byStatus: stats.reduce((acc: any, curr: any) => {
                acc[curr._id] = {
                    count: curr.count,
                    amount: curr.totalAmount,
                };
                return acc;
            }, {}),
        };
    }
}

export default new PaymentService();
