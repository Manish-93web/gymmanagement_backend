import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
    tenantId: mongoose.Types.ObjectId;
    referrerId: mongoose.Types.ObjectId; // Member who referred
    referredId: mongoose.Types.ObjectId; // New member referred
    status: 'pending' | 'converted' | 'rewarded' | 'expired';
    referralCode: string;
    rewardType: 'credit' | 'membership_extension' | 'gift';
    rewardValue: number;
    convertedAt?: Date;
    rewardedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ReferralSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        referrerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        referredId: { type: Schema.Types.ObjectId, ref: 'Member', index: true },
        status: {
            type: String,
            enum: ['pending', 'converted', 'rewarded', 'expired'],
            default: 'pending',
            index: true,
        },
        referralCode: { type: String, required: true },
        rewardType: { type: String, enum: ['credit', 'membership_extension', 'gift'], default: 'credit' },
        rewardValue: { type: Number, default: 0 },
        convertedAt: { type: Date },
        rewardedAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes
ReferralSchema.index({ tenantId: 1, referrerId: 1 });
ReferralSchema.index({ referralCode: 1 });

export default mongoose.model<IReferral>('Referral', ReferralSchema);
