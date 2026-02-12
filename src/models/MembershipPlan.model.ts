import mongoose, { Schema, Document } from 'mongoose';

export type PlanType = 'time_based' | 'session_based' | 'hybrid';
export type PlanDuration = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export interface IMembershipPlan extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    type: PlanType;
    duration: PlanDuration;
    durationValue: number;
    pricing: {
        basePrice: number;
        taxRate: number;
        discountPercent: number;
        finalPrice: number;
        pricingTiers?: {
            durationValue: number;
            price: number;
        }[];
    };
    referralBonus?: number;
    sessions?: {
        totalSessions: number;
        sessionsPerWeek?: number;
        sessionValidity?: number; // days
    };
    features: {
        gymAccess: boolean;
        groupClasses: boolean;
        personalTraining: boolean;
        onlineClasses: boolean;
        dietPlan: boolean;
        lockerFacility: boolean;
        freezeAllowed: boolean;
        maxFreezes?: number;
        freezeDuration?: number; // days
        branchTransferAllowed: boolean;
    };
    addOns: {
        name: string;
        price: number;
        description: string;
    }[];
    isFamilyPlan: boolean;
    maxFamilyMembers?: number;
    familyDiscount?: number;
    isActive: boolean;
    validFrom?: Date;
    validUntil?: Date;
    maxMembers?: number;
    currentMembers: number;
    createdAt: Date;
    updatedAt: Date;
}

const MembershipPlanSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        name: { type: String, required: true },
        description: { type: String },
        type: {
            type: String,
            enum: ['time_based', 'session_based', 'hybrid'],
            required: true,
        },
        duration: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
            required: true,
        },
        durationValue: { type: Number, required: true },
        pricing: {
            basePrice: { type: Number, required: true },
            taxRate: { type: Number, default: 0 },
            discountPercent: { type: Number, default: 0 },
            finalPrice: { type: Number, required: true },
            pricingTiers: [
                {
                    durationValue: { type: Number },
                    price: { type: Number },
                },
            ],
        },
        referralBonus: { type: Number, default: 0 },
        sessions: {
            totalSessions: { type: Number },
            sessionsPerWeek: { type: Number },
            sessionValidity: { type: Number },
        },
        features: {
            gymAccess: { type: Boolean, default: true },
            groupClasses: { type: Boolean, default: false },
            personalTraining: { type: Boolean, default: false },
            onlineClasses: { type: Boolean, default: false },
            dietPlan: { type: Boolean, default: false },
            lockerFacility: { type: Boolean, default: false },
            freeZeAllowed: { type: Boolean, default: true },
            maxFreezes: { type: Number, default: 2 },
            freezeDuration: { type: Number, default: 30 },
            branchTransferAllowed: { type: Boolean, default: false },
        },
        addOns: [
            {
                name: { type: String, required: true },
                price: { type: Number, required: true },
                description: { type: String },
            },
        ],
        isFamilyPlan: { type: Boolean, default: false },
        maxFamilyMembers: { type: Number },
        familyDiscount: { type: Number },
        isActive: { type: Boolean, default: true, index: true },
        validFrom: { type: Date },
        validUntil: { type: Date },
        maxMembers: { type: Number },
        currentMembers: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Indexes
MembershipPlanSchema.index({ tenantId: 1, isActive: 1 });
MembershipPlanSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });

export default mongoose.model<IMembershipPlan>('MembershipPlan', MembershipPlanSchema);
