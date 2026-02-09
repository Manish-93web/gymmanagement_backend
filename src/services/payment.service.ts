import Razorpay from 'razorpay';
import Stripe from 'stripe';
import Payment, { IPayment } from '../models/Payment.model';
import Subscription from '../models/Subscription.model';
import { config } from '../config/config';
import { generateInvoiceNumber } from '../utils/helpers.utils';
import mongoose from 'mongoose';

// Initialize payment gateways
const razorpay = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
});

const stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: '2024-12-18.acacia',
});

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
            ...data,
            invoiceNumber,
            taxAmount,
            totalAmount: data.amount + taxAmount,
            status: 'pending',
        });

        return payment;
    }

    // Create Razorpay order
    async createRazorpayOrder(amount: number, currency: string = 'INR'): Promise<any> {
        try {
            const order = await razorpay.orders.create({
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
        try {
            const paymentIntent = await stripe.paymentIntents.create({
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
                        gateway: data.gateway,
                        gatewayPaymentId: data.gatewayPaymentId,
                        gatewayOrderId: data.gatewayOrderId,
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
                                amount: payment.totalAmount,
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
        if (payment.gateway === 'razorpay' && payment.gatewayPaymentId) {
            try {
                await razorpay.payments.refund(payment.gatewayPaymentId, {
                    amount: refundAmount * 100,
                });
            } catch (error) {
                console.error('Razorpay refund failed:', error);
                throw new Error('Failed to process Razorpay refund');
            }
        } else if (payment.gateway === 'stripe' && payment.gatewayPaymentId) {
            try {
                await stripe.refunds.create({
                    payment_intent: payment.gatewayPaymentId,
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
                        processedAt: new Date(),
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
            Payment.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
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
                    totalAmount: { $sum: '$totalAmount' },
                },
            },
        ]);

        const total = await Payment.countDocuments(filter);
        const totalRevenue = await Payment.aggregate([
            { $match: { ...filter, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
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
