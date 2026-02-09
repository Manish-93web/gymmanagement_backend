import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'net_banking' | 'wallet' | 'razorpay' | 'stripe';
export type PaymentType = 'subscription' | 'renewal' | 'addon' | 'pos' | 'penalty' | 'other';

export interface IPayment extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId?: mongoose.Types.ObjectId;
    subscriptionId?: mongoose.Types.ObjectId;
    invoiceNumber: string;
    type: PaymentType;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: {
        subtotal: number;
        taxAmount: number;
        discountAmount: number;
        total: number;
    };
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
        subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
        invoiceNumber: { type: String, required: true, unique: true },
        type: {
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
        amount: {
            subtotal: { type: Number, required: true },
            taxAmount: { type: Number, default: 0 },
            discountAmount: { type: Number, default: 0 },
            total: { type: Number, required: true },
        },
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

export default mongoose.model<IPayment>('Payment', PaymentSchema);
