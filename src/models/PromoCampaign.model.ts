import mongoose, { Schema, Document } from 'mongoose';

export interface IPromoCampaign extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    type: 'discount' | 'referral' | 'loyalty' | 'bundle';
    status: 'draft' | 'active' | 'scheduled' | 'expired';
    startDate: Date;
    endDate: Date;
    couponId?: mongoose.Types.ObjectId;
    couponCode?: string;
    targetSegments: string[];
    launchedAt?: Date;
    totalReach?: number;
    channels?: string[];
    emailsSent?: number;
    smsSent?: number;
    whatsappSent?: number;
    budget?: number;
    performance: {
        totalViews: number;
        totalConversions: number;
        revenueGenerated: number;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PromoCampaignSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        type: {
            type: String,
            enum: ['discount', 'referral', 'loyalty', 'bundle'],
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'active', 'scheduled', 'expired'],
            default: 'draft',
            index: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
        couponCode: { type: String },
        targetSegments: [{ type: String }],
        launchedAt: { type: Date },
        totalReach: { type: Number, default: 0 },
        channels: [{ type: String }],
        emailsSent: { type: Number, default: 0 },
        smsSent: { type: Number, default: 0 },
        whatsappSent: { type: Number, default: 0 },
        budget: { type: Number, default: 0 },
        performance: {
            totalViews: { type: Number, default: 0 },
            totalConversions: { type: Number, default: 0 },
            revenueGenerated: { type: Number, default: 0 },
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Indexes
PromoCampaignSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model<IPromoCampaign>('PromoCampaign', PromoCampaignSchema);
