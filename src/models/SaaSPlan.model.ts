import mongoose, { Schema, Document } from 'mongoose';

export type FeatureVersion = 'basic' | 'advanced' | 'enterprise';

export interface ISaaSPlan extends Document {
    name: string;
    slug: string;
    description: string;
    type: 'trial' | 'standard' | 'enterprise' | 'custom';
    pricing: {
        monthly: number;
        yearly: number;
        currency: string;
    };
    limits: {
        branches: number;
        members: number;
        trainers: number;
        storageGB: number;
        monthlySms: number;
        monthlyWa: number;
    };
    features: {
        id: string;
        version: FeatureVersion;
        enabled: boolean;
    }[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SaaSPlanSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String },
        type: {
            type: String,
            enum: ['trial', 'standard', 'enterprise', 'custom'],
            default: 'standard',
        },
        pricing: {
            monthly: { type: Number, required: true },
            yearly: { type: Number, required: true },
            currency: { type: String, default: 'INR' },
        },
        limits: {
            branches: { type: Number, default: 1 },
            members: { type: Number, default: 100 },
            trainers: { type: Number, default: 10 },
            storageGB: { type: Number, default: 1 },
            monthlySms: { type: Number, default: 0 },
            monthlyWa: { type: Number, default: 0 },
        },
        features: [
            {
                id: { type: String, required: true },
                version: {
                    type: String,
                    enum: ['basic', 'advanced', 'enterprise'],
                    default: 'basic',
                },
                enabled: { type: Boolean, default: true },
            },
        ],
        isDefault: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

SaaSPlanSchema.index({ slug: 1 });
SaaSPlanSchema.index({ type: 1 });

export default mongoose.model<ISaaSPlan>('SaaSPlan', SaaSPlanSchema);
