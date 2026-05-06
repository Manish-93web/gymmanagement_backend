import mongoose, { Schema, Document } from 'mongoose';

export interface IRewardRedemption extends Document {
    rewardId: mongoose.Types.ObjectId;
    itemId: mongoose.Types.ObjectId; // alias for rewardId, kept for service compatibility
    memberId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    pointsSpent: number;
    status: 'pending' | 'fulfilled' | 'delivered' | 'approved' | 'cancelled';
    redeemedAt: Date;
    deliveredAt?: Date;
    notes?: string;
}

const schema = new Schema({
    rewardId: { type: Schema.Types.ObjectId, ref: 'RewardItem', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    pointsSpent: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'fulfilled', 'delivered', 'approved', 'cancelled'],
        default: 'pending',
    },
    redeemedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    notes: String,
}, { timestamps: true });

// Virtual for service compatibility: itemId → rewardId
schema.virtual('itemId').get(function (this: any) {
    return this.rewardId;
});

export default mongoose.model<IRewardRedemption>('RewardRedemption', schema);
