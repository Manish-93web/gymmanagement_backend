import mongoose, { Schema, Document } from 'mongoose';

export interface IRefundRequest extends Document {
    tenantId: string;
    memberId: string;
    memberName: string;
    subscriptionId?: string;
    invoiceId?: string;
    reason: string;
    reasonCategory: 'relocated' | 'medical' | 'dissatisfied' | 'financial' | 'duplicate_payment' | 'other';
    purchaseDate?: Date;
    amount: number;
    calculatedRefundAmount?: number;
    eligiblePercent?: number;
    processingFee?: number;
    netRefundAmount?: number;
    status: 'pending' | 'approved' | 'rejected' | 'processed';
    adminNote?: string;
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    processedAt?: Date;
    refundTransactionId?: string;
    requestNumber: string;
    createdAt: Date;
    updatedAt: Date;
}

const RefundRequestSchema = new Schema<IRefundRequest>(
    {
        tenantId: { type: String, required: true, index: true },
        memberId: { type: String, required: true },
        memberName: { type: String, required: true, trim: true },
        subscriptionId: { type: String },
        invoiceId: { type: String },
        reason: { type: String, required: true, trim: true },
        reasonCategory: {
            type: String,
            enum: ['relocated', 'medical', 'dissatisfied', 'financial', 'duplicate_payment', 'other'],
            required: true,
        },
        purchaseDate: { type: Date },
        amount: { type: Number, required: true, min: 0 },
        calculatedRefundAmount: { type: Number, min: 0 },
        eligiblePercent: { type: Number, min: 0, max: 100 },
        processingFee: { type: Number, min: 0 },
        netRefundAmount: { type: Number, min: 0 },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'processed'],
            default: 'pending',
            index: true,
        },
        adminNote: { type: String, trim: true },
        approvedBy: { type: String },
        approvedAt: { type: Date },
        rejectedBy: { type: String },
        rejectedAt: { type: Date },
        processedAt: { type: Date },
        refundTransactionId: { type: String, trim: true },
        requestNumber: { type: String, unique: true, sparse: true },
    },
    { timestamps: true }
);

// Auto-generate requestNumber before save
RefundRequestSchema.pre('save', async function () {
    if (this.requestNumber) return;

    const year = new Date().getFullYear();
    const prefix = `RR-${year}-`;

    const count = await (this.constructor as typeof mongoose.Model).countDocuments({
        tenantId: this.tenantId,
        requestNumber: { $regex: `^${prefix}` },
    });

    const seq = String(count + 1).padStart(4, '0');
    this.requestNumber = `${prefix}${seq}`;
});

// Indexes
RefundRequestSchema.index({ tenantId: 1, requestNumber: 1 }, { unique: true, sparse: true });
RefundRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
RefundRequestSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });

export default mongoose.model<IRefundRequest>('RefundRequest', RefundRequestSchema);
