import mongoose, { Schema, Document } from 'mongoose';

export interface IRefundTier {
    fromDay: number;   // days since purchase (inclusive)
    toDay: number;     // days since purchase (inclusive)
    refundPercent: number; // 0-100
}

export interface IRefundPolicy extends Document {
    tenantId: string;
    isEnabled: boolean;
    processingFee: number;           // flat fee or % deducted from any refund
    processingFeeType: 'flat' | 'percent';
    tiers: IRefundTier[];
    afterMaxDayRefundPercent: number; // default 0 — no refund after last tier
    nonRefundablePlanIds: string[];   // plan IDs that are non-refundable
    requiresApproval: boolean;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const DEFAULT_TIERS: IRefundTier[] = [
    { fromDay: 1,  toDay: 30, refundPercent: 100 },
    { fromDay: 31, toDay: 60, refundPercent: 50  },
    { fromDay: 61, toDay: 90, refundPercent: 25  },
];

const RefundTierSchema = new Schema<IRefundTier>(
    {
        fromDay:       { type: Number, required: true, min: 0 },
        toDay:         { type: Number, required: true, min: 0 },
        refundPercent: { type: Number, required: true, min: 0, max: 100 },
    },
    { _id: false }
);

const RefundPolicySchema = new Schema<IRefundPolicy>(
    {
        tenantId: { type: String, required: true, unique: true, index: true },
        isEnabled: { type: Boolean, default: true },
        processingFee: { type: Number, default: 750, min: 0 },
        processingFeeType: { type: String, enum: ['flat', 'percent'], default: 'flat' },
        tiers: { type: [RefundTierSchema], default: DEFAULT_TIERS },
        afterMaxDayRefundPercent: { type: Number, default: 0, min: 0, max: 100 },
        nonRefundablePlanIds: { type: [String], default: [] },
        requiresApproval: { type: Boolean, default: false },
        notes: { type: String },
    },
    { timestamps: true }
);

// ─── Static method: calculateRefund ──────────────────────────────────────────
RefundPolicySchema.statics.calculateRefund = function (
    policy: IRefundPolicy,
    purchaseDate: Date,
    amount: number
): {
    refundAmount: number;
    tier: IRefundTier | null;
    processingFeeDeducted: number;
    eligiblePercent: number;
} {
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSincePurchase = Math.floor((now.getTime() - purchaseDate.getTime()) / msPerDay) + 1;

    if (!policy.isEnabled) {
        return { refundAmount: 0, tier: null, processingFeeDeducted: 0, eligiblePercent: 0 };
    }

    // Sort tiers by fromDay ascending
    const sortedTiers = [...policy.tiers].sort((a, b) => a.fromDay - b.fromDay);
    let matchedTier: IRefundTier | null = null;
    let eligiblePercent = policy.afterMaxDayRefundPercent;

    for (const tier of sortedTiers) {
        if (daysSincePurchase >= tier.fromDay && daysSincePurchase <= tier.toDay) {
            matchedTier = tier;
            eligiblePercent = tier.refundPercent;
            break;
        }
    }

    const grossRefund = (amount * eligiblePercent) / 100;

    let processingFeeDeducted = 0;
    if (policy.processingFeeType === 'flat') {
        processingFeeDeducted = Math.min(policy.processingFee, grossRefund);
    } else {
        processingFeeDeducted = (grossRefund * policy.processingFee) / 100;
    }

    const refundAmount = Math.max(0, grossRefund - processingFeeDeducted);

    return { refundAmount: Math.round(refundAmount * 100) / 100, tier: matchedTier, processingFeeDeducted: Math.round(processingFeeDeducted * 100) / 100, eligiblePercent };
};

// Index for fast tenant lookup
RefundPolicySchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model<IRefundPolicy>('RefundPolicy', RefundPolicySchema);
