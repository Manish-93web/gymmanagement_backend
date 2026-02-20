import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
    tenantId: mongoose.Types.ObjectId;
    code: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    type: 'percentage' | 'fixed'; // alias for discountType
    discountValue: number;
    minPurchaseAmount?: number;
    maxDiscountAmount?: number;
    validFrom: Date;
    validUntil: Date;
    usageLimit?: number;
    usageCount: number;
    perUserLimit?: number;
    usedBy?: {
        userId: mongoose.Types.ObjectId;
        paymentId: mongoose.Types.ObjectId;
        usedAt: Date;
    }[];
    applicablePlans: mongoose.Types.ObjectId[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CouponSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        description: { type: String, required: true },
        discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
        discountValue: { type: Number, required: true },
        minPurchaseAmount: { type: Number, default: 0 },
        maxDiscountAmount: { type: Number },
        validFrom: { type: Date, required: true, default: Date.now },
        validUntil: { type: Date, required: true },
        usageLimit: { type: Number },
        usageCount: { type: Number, default: 0 },
        perUserLimit: { type: Number },
        usedBy: [
            {
                userId: { type: Schema.Types.ObjectId, ref: 'User' },
                paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
                usedAt: { type: Date, default: Date.now },
            },
        ],
        applicablePlans: [{ type: Schema.Types.ObjectId, ref: 'MembershipPlan' }],
        isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

// Indexes
CouponSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
