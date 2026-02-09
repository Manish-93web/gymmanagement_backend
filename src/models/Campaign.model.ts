import mongoose, { Schema, Document } from 'mongoose';

export type CampaignType = 'email' | 'sms' | 'whatsapp' | 'push' | 'referral' | 'promo';
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface ICampaign extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    type: CampaignType;
    status: CampaignStatus;
    targetAudience: {
        memberStatus?: string[];
        tags?: string[];
        planIds?: mongoose.Types.ObjectId[];
        customFilter?: any;
    };
    content: {
        subject?: string;
        message: string;
        template?: string;
        attachments?: string[];
    };
    schedule: {
        startDate: Date;
        endDate?: Date;
        sendTime?: string;
        timezone?: string;
    };
    referralSettings?: {
        referrerReward: number;
        refereeReward: number;
        maxReferrals?: number;
        validityDays?: number;
    };
    promoSettings?: {
        code: string;
        discountType: 'percentage' | 'fixed';
        discountValue: number;
        maxUses?: number;
        validFrom: Date;
        validUntil: Date;
    };
    analytics: {
        totalRecipients: number;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        converted: number;
        revenue: number;
    };
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CampaignSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        name: { type: String, required: true },
        description: { type: String },
        type: {
            type: String,
            enum: ['email', 'sms', 'whatsapp', 'push', 'referral', 'promo'],
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
            default: 'draft',
            index: true,
        },
        targetAudience: {
            memberStatus: [{ type: String }],
            tags: [{ type: String }],
            planIds: [{ type: Schema.Types.ObjectId, ref: 'MembershipPlan' }],
            customFilter: { type: Schema.Types.Mixed },
        },
        content: {
            subject: { type: String },
            message: { type: String, required: true },
            template: { type: String },
            attachments: [{ type: String }],
        },
        schedule: {
            startDate: { type: Date, required: true },
            endDate: { type: Date },
            sendTime: { type: String },
            timezone: { type: String, default: 'UTC' },
        },
        referralSettings: {
            referrerReward: { type: Number },
            refereeReward: { type: Number },
            maxReferrals: { type: Number },
            validityDays: { type: Number },
        },
        promoSettings: {
            code: { type: String, unique: true, sparse: true },
            discountType: { type: String, enum: ['percentage', 'fixed'] },
            discountValue: { type: Number },
            maxUses: { type: Number },
            validFrom: { type: Date },
            validUntil: { type: Date },
        },
        analytics: {
            totalRecipients: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
            converted: { type: Number, default: 0 },
            revenue: { type: Number, default: 0 },
        },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

// Indexes
CampaignSchema.index({ tenantId: 1, status: 1 });
CampaignSchema.index({ 'schedule.startDate': 1, status: 1 });

export default mongoose.model<ICampaign>('Campaign', CampaignSchema);
