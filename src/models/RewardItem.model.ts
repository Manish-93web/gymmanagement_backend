import mongoose, { Schema, Document } from 'mongoose';

export interface IRewardItem extends Document {
    name: string;
    description: string;
    category: 'merchandise' | 'discount' | 'service' | 'upgrade';
    pointsCost: number;
    stock?: number;
    imageUrl?: string;
    validUntil?: Date;
    tenantId: mongoose.Types.ObjectId;
    isActive: boolean;
    redeemedCount: number;
    createdAt: Date;
}

const RewardItemSchema: Schema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
        type: String,
        enum: ['merchandise', 'discount', 'service', 'upgrade'],
        required: true
    },
    pointsCost: { type: Number, required: true },
    stock: { type: Number },
    imageUrl: { type: String },
    validUntil: { type: Date },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    isActive: { type: Boolean, default: true },
    redeemedCount: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<IRewardItem>('RewardItem', RewardItemSchema);
