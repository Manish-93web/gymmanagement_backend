import mongoose, { Schema, Document } from 'mongoose';

export interface ISaaSPayment extends Document {
    tenantId: mongoose.Types.ObjectId;
    saasPlanId?: mongoose.Types.ObjectId;
    amount: number;
    currency: string;
    type: 'subscription' | 'addon' | 'setup_fee';
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    billingPeriod: {
        start: Date;
        end: Date;
    };
    gateway: {
        provider: 'razorpay' | 'stripe' | 'manual' | 'upi';
        transactionId?: string;
        orderId?: string;
    };
    invoiceUrl?: string;
    paidAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const SaaSPaymentSchema = new Schema<ISaaSPayment>(
    {
        tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        saasPlanId: { type: Schema.Types.ObjectId, ref: 'SaaSPlan' },
        amount:     { type: Number, required: true, min: 0 },
        currency:   { type: String, default: 'INR' },
        type:       { type: String, enum: ['subscription', 'addon', 'setup_fee'], required: true },
        status:     { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
        billingPeriod: {
            start: { type: Date },
            end:   { type: Date },
        },
        gateway: {
            provider:      { type: String, enum: ['razorpay', 'stripe', 'manual', 'upi'], required: true },
            transactionId: { type: String },
            orderId:       { type: String },
        },
        invoiceUrl: { type: String },
        paidAt:     { type: Date },
    },
    { timestamps: true }
);

SaaSPaymentSchema.index({ tenantId: 1, createdAt: -1 });
SaaSPaymentSchema.index({ status: 1 });

export default (mongoose.models.SaaSPayment as mongoose.Model<ISaaSPayment>) ||
    mongoose.model<ISaaSPayment>('SaaSPayment', SaaSPaymentSchema);
