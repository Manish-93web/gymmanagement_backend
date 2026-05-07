import mongoose, { Schema, Document } from 'mongoose';

export type SubscriptionStatus = 'active' | 'paused' | 'frozen' | 'expired' | 'cancelled';

export interface ISubscription extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    planId: mongoose.Types.ObjectId;
    status: SubscriptionStatus;
    startDate: Date;
    endDate: Date;
    autoRenew: boolean;
    pricing: {
        basePrice: number;
        taxAmount: number;
        discountAmount: number;
        addOnsTotal: number;
        totalAmount: number;
        proRataAmount?: number;
        proRataCredit?: number;
    };
    familyMembers?: mongoose.Types.ObjectId[];
    addOns: {
        name: string;
        price: number;
    }[];
    sessions?: {
        totalSessions: number;
        usedSessions: number;
        remainingSessions: number;
    };
    freezeHistory: {
        startDate: Date;
        endDate: Date;
        reason: string;
        approvedBy: mongoose.Types.ObjectId;
        daysExtended: number;
    }[];
    currentFreeze?: {
        startDate: Date;
        plannedEndDate: Date;
        reason: string;
    };
    renewalHistory: {
        renewedAt: Date;
        previousEndDate: Date;
        newEndDate: Date;
        amount: number;
    }[];
    cancellation?: {
        cancelledAt: Date;
        cancelledBy: mongoose.Types.ObjectId;
        reason: string;
        refundAmount: number;
        refundStatus: 'pending' | 'processed' | 'rejected';
    };
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
        status: {
            type: String,
            enum: ['active', 'paused', 'frozen', 'expired', 'cancelled'],
            default: 'active',
            index: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true, index: true },
        autoRenew: { type: Boolean, default: false },
        pricing: {
            basePrice: { type: Number, required: true },
            taxAmount: { type: Number, default: 0 },
            discountAmount: { type: Number, default: 0 },
            addOnsTotal: { type: Number, default: 0 },
            totalAmount: { type: Number, required: true },
            proRataAmount: { type: Number },
            proRataCredit: { type: Number, default: 0 },
        },
        familyMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        addOns: [
            {
                name: { type: String, required: true },
                price: { type: Number, required: true },
            },
        ],
        sessions: {
            totalSessions: { type: Number },
            usedSessions: { type: Number, default: 0 },
            remainingSessions: { type: Number },
        },
        freezeHistory: [
            {
                startDate: { type: Date, required: true },
                endDate: { type: Date, required: true },
                reason: { type: String },
                approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
                daysExtended: { type: Number, required: true },
            },
        ],
        currentFreeze: {
            startDate: { type: Date },
            plannedEndDate: { type: Date },
            reason: { type: String },
        },
        renewalHistory: [
            {
                renewedAt: { type: Date, required: true },
                previousEndDate: { type: Date, required: true },
                newEndDate: { type: Date, required: true },
                amount: { type: Number, required: true },
            },
        ],
        cancellation: {
            cancelledAt: { type: Date },
            cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
            reason: { type: String },
            refundAmount: { type: Number },
            refundStatus: {
                type: String,
                enum: ['pending', 'processed', 'rejected'],
            },
        },
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
SubscriptionSchema.index({ tenantId: 1, status: 1, endDate: 1 });
SubscriptionSchema.index({ memberId: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1, autoRenew: 1 });
SubscriptionSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
