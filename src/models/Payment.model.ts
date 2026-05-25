import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'net_banking' | 'wallet' | 'razorpay' | 'stripe';
export type PaymentType = 'subscription' | 'renewal' | 'addon' | 'pos' | 'penalty' | 'other';

export interface IPayment extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId?: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId; // Alias for memberId
    subscriptionId?: mongoose.Types.ObjectId;
    planId?: mongoose.Types.ObjectId; // Injected for consistency
    invoiceNumber: string;
    description?: string;
    paymentType: PaymentType;
    type: PaymentType;
    method: PaymentMethod;
    status: PaymentStatus;
    failedReason?: string;
    paidAt?: Date;
    amount: {
        subtotal: number;
        taxAmount: number;
        discountAmount: number;
        total: number;
    };
    couponCode?: string;
    discount?: number;
    retryAttempts?: number;
    retryHistory?: {
        attemptNumber: number;
        attemptedAt: Date;
        status: 'success' | 'failed';
        error?: string;
        newPaymentId?: mongoose.Types.ObjectId;
        gateway?: string;
    }[];
    taxDetails: {
        taxType: 'GST' | 'VAT' | 'SALES_TAX' | 'NONE';
        taxRate: number;
        cgst?: number;
        sgst?: number;
        igst?: number;
    };
    gateway?: {
        provider: 'razorpay' | 'stripe';
        transactionId: string;
        orderId: string;
        paymentId: string;
        gatewayPaymentId?: string;
        signature?: string;
    };
    refund?: {
        amount: number;
        reason: string;
        refundedAt: Date;
        refundedBy: mongoose.Types.ObjectId;
        refundTransactionId?: string;
    };
    invoice: {
        generated: boolean;
        generatedAt?: Date;
        pdfUrl?: string;
        emailSent: boolean;
        emailSentAt?: Date;
    };
    metadata: {
        description: string;
        items: {
            name: string;
            quantity: number;
            price: number;
            total: number;
        }[];
    };
    collectedBy?: mongoose.Types.ObjectId;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'Member', index: true }, // Duplicate for service compatibility
        subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
        planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
        invoiceNumber: { type: String, required: true, unique: true },
        type: {
            type: String,
            enum: ['subscription', 'renewal', 'addon', 'pos', 'penalty', 'other'],
            required: true,
        },
        paymentType: {
            type: String,
            enum: ['subscription', 'renewal', 'addon', 'pos', 'penalty', 'other'],
            required: true,
        },
        method: {
            type: String,
            enum: ['cash', 'card', 'upi', 'net_banking', 'wallet', 'razorpay', 'stripe'],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'],
            default: 'pending',
            index: true,
        },
        failedReason: { type: String },
        paidAt: { type: Date },
        amount: {
            subtotal: { type: Number, required: true },
            taxAmount: { type: Number, default: 0 },
            discountAmount: { type: Number, default: 0 },
            total: { type: Number, required: true },
        },
        couponCode: { type: String },
        discount: { type: Number, default: 0 },
        retryAttempts: { type: Number, default: 0 },
        retryHistory: [
            {
                attemptNumber: { type: Number },
                attemptedAt: { type: Date },
                status: { type: String, enum: ['success', 'failed'] },
                error: { type: String },
                newPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
                gateway: { type: String },
            },
        ],
        taxDetails: {
            taxType: {
                type: String,
                enum: ['GST', 'VAT', 'SALES_TAX', 'NONE'],
                default: 'NONE',
            },
            taxRate: { type: Number, default: 0 },
            cgst: { type: Number },
            sgst: { type: Number },
            igst: { type: Number },
        },
        gateway: {
            provider: { type: String, enum: ['razorpay', 'stripe'] },
            transactionId: { type: String },
            orderId: { type: String },
            paymentId: { type: String },
            signature: { type: String },
        },
        refund: {
            amount: { type: Number },
            reason: { type: String },
            refundedAt: { type: Date },
            refundedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            refundTransactionId: { type: String },
        },
        invoice: {
            generated: { type: Boolean, default: false },
            generatedAt: { type: Date },
            pdfUrl: { type: String },
            emailSent: { type: Boolean, default: false },
            emailSentAt: { type: Date },
        },
        metadata: {
            description: { type: String },
            items: [
                {
                    name: { type: String, required: true },
                    quantity: { type: Number, required: true },
                    price: { type: Number, required: true },
                    total: { type: Number, required: true },
                },
            ],
        },
        collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
PaymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ memberId: 1, createdAt: -1 });
PaymentSchema.index({ 'gateway.transactionId': 1 });
// Additional indexes for 1000+ gym scale
PaymentSchema.index({ tenantId: 1, createdAt: -1 });
PaymentSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
PaymentSchema.index({ tenantId: 1, memberId: 1, status: 1 });
PaymentSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
