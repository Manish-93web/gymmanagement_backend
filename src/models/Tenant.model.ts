import mongoose, { Schema, Document } from 'mongoose';

export interface ITenant extends Document {
    name: string;
    slug: string;
    domain?: string;
    logo?: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    isActive: boolean;
    saasPlanId?: mongoose.Types.ObjectId;
    subscription: {
        plan: 'trial' | 'basic' | 'pro' | 'enterprise';
        status: 'active' | 'inactive' | 'suspended' | 'cancelled';
        startDate: Date;
        endDate?: Date;
        maxBranches: number;
        maxMembers: number;
        maxTrainers: number;
        gracePeriodStart?: Date;
    };
    lockState: 'none' | 'soft' | 'hard';
    usageOverrides: {
        featureId: string;
        limit?: number;
        enabled: boolean;
    }[];
    features: {
        aiEnabled: boolean;
        onlineClasses: boolean;
        pos: boolean;
        whatsappIntegration: boolean;
        smsNotifications: boolean;
        emailNotifications: boolean;
        customDomain: boolean;
        multiCurrency: boolean;
    };
    billing: {
        currency: string;
        taxRate: number;
        taxType: 'GST' | 'VAT' | 'SALES_TAX' | 'NONE';
        billingEmail: string;
    };
    integrations: {
        razorpayKeyId?: string;
        razorpayKeySecret?: string;
        stripeKeyId?: string;
        stripeKeySecret?: string;
        openaiApiKey?: string;
        zoomApiKey?: string;
        zoomApiSecret?: string;
    };
    contactInfo: {
        email: string;
        phone: string;
        address: string;
        city: string;
        state: string;
        country: string;
        zipCode: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        domain: { type: String, unique: true, sparse: true },
        logo: { type: String },
        primaryColor: { type: String, default: '#6366f1' },
        secondaryColor: { type: String, default: '#8b5cf6' },
        fontFamily: { type: String, default: 'Inter' },
        isActive: { type: Boolean, default: true },
        saasPlanId: { type: Schema.Types.ObjectId, ref: 'SaaSPlan' },
        subscription: {
            plan: {
                type: String,
                enum: ['trial', 'basic', 'pro', 'enterprise'],
                default: 'trial',
            },
            status: {
                type: String,
                enum: ['active', 'inactive', 'suspended', 'cancelled'],
                default: 'active',
            },
            startDate: { type: Date, default: Date.now },
            endDate: { type: Date },
            maxBranches: { type: Number, default: 1 },
            maxMembers: { type: Number, default: 100 },
            maxTrainers: { type: Number, default: 10 },
            gracePeriodStart: { type: Date },
        },
        lockState: {
            type: String,
            enum: ['none', 'soft', 'hard'],
            default: 'none',
        },
        usageOverrides: [
            {
                featureId: { type: String, required: true },
                limit: { type: Number },
                enabled: { type: Boolean, required: true },
            },
        ],
        features: {
            aiEnabled: { type: Boolean, default: false },
            onlineClasses: { type: Boolean, default: false },
            pos: { type: Boolean, default: false },
            whatsappIntegration: { type: Boolean, default: false },
            smsNotifications: { type: Boolean, default: true },
            emailNotifications: { type: Boolean, default: true },
            customDomain: { type: Boolean, default: false },
            multiCurrency: { type: Boolean, default: false },
        },
        billing: {
            currency: { type: String, default: 'USD' },
            taxRate: { type: Number, default: 0 },
            taxType: {
                type: String,
                enum: ['GST', 'VAT', 'SALES_TAX', 'NONE'],
                default: 'NONE',
            },
            billingEmail: { type: String },
        },
        integrations: {
            razorpayKeyId: { type: String },
            razorpayKeySecret: { type: String },
            stripeKeyId: { type: String },
            stripeKeySecret: { type: String },
            openaiApiKey: { type: String },
            zoomApiKey: { type: String },
            zoomApiSecret: { type: String },
        },
        contactInfo: {
            email: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String },
            city: { type: String },
            state: { type: String },
            country: { type: String },
            zipCode: { type: String },
        },
    },
    { timestamps: true }
);

// Indexes
TenantSchema.index({ 'subscription.status': 1 });

export default mongoose.model<ITenant>('Tenant', TenantSchema);
