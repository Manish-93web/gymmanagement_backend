import mongoose, { Schema, Document } from 'mongoose';

export interface IRewardRedemption extends Document {
    memberId: mongoose.Types.ObjectId;
    itemId: mongoose.Types.ObjectId;
    pointsSpent: number;
    status: 'pending' | 'approved' | 'delivered' | 'cancelled';
    redeemedAt: Date;
    deliveredAt?: Date;
    notes?: string;
}

const RewardRedemptionSchema: Schema = new Schema({
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'RewardItem', required: true, index: true },
    pointsSpent: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'delivered', 'cancelled'],
        default: 'pending'
    },
    redeemedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    notes: { type: String },
}, { timestamps: true });

export default mongoose.model<IRewardRedemption>('RewardRedemption', RewardRedemptionSchema);
