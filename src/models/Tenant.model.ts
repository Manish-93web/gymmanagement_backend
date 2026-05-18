import mongoose, { Schema, Document } from 'mongoose';

export interface ITenant extends Document {
    name: string;
    slug: string;
    // domain?: string;
    branding: {
        logo?: string;
        favicon?: string;
        primaryColor: string;
        secondaryColor: string;
        fontFamily: string;
        customCss?: string;
        customDomain?: string;
        domainStatus?: 'pending' | 'verified' | 'failed';
    };
    customDomain?: {
        domain: string;
        verified: boolean;
        verificationToken?: string;
        addedAt: Date;
        verifiedAt?: Date;
    };
    isActive: boolean;
    saasPlanId?: mongoose.Types.ObjectId;
    securitySettings: {
        twoFactorEnabled: boolean;
        twoFactorMethod: 'email' | 'sms' | 'app';
        ipWhitelist: string[];
    };
    subscription: {
        plan: 'trial' | 'basic' | 'pro' | 'pro_6m' | 'pro_annual' | 'enterprise';
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
        email: {
            provider: 'smtp' | 'sendgrid' | 'mailgun';
            host?: string;
            port?: number;
            username?: string;
            password?: string;
            fromName?: string;
            fromEmail?: string;
            active: boolean;
        };
        sms: {
            provider: 'twilio' | 'msg91';
            accountSid?: string;
            authToken?: string;
            fromNumber?: string;
            active: boolean;
        };
        whatsapp: {
            provider: 'twilio' | 'official';
            accountSid?: string;
            authToken?: string;
            fromNumber?: string;
            active: boolean;
        };
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
        // domain: { type: String, unique: true, sparse: true }, // Removed to avoid conflict with customDomain.domain
        branding: {
            logo: { type: String },
            favicon: { type: String },
            primaryColor: { type: String, default: '#6366f1' },
            secondaryColor: { type: String, default: '#8b5cf6' },
            fontFamily: { type: String, default: 'Inter' },
            customCss: { type: String },
        },
        customDomain: {
            domain: { type: String, unique: true, sparse: true },
            verified: { type: Boolean, default: false },
            verificationToken: { type: String },
            addedAt: { type: Date },
            verifiedAt: { type: Date },
        },
        isActive: { type: Boolean, default: true },
        saasPlanId: { type: Schema.Types.ObjectId, ref: 'SaaSPlan' },
        securitySettings: {
            twoFactorEnabled: { type: Boolean, default: false },
            twoFactorMethod: { type: String, enum: ['email', 'sms', 'app'], default: 'email' },
            ipWhitelist: [{ type: String }],
        },
        subscription: {
            plan: {
                type: String,
                enum: ['trial', 'basic', 'pro', 'pro_6m', 'pro_annual', 'enterprise'],
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
            email: {
                provider: { type: String, enum: ['smtp', 'sendgrid', 'mailgun'], default: 'smtp' },
                host: { type: String },
                port: { type: Number },
                username: { type: String },
                password: { type: String },
                fromName: { type: String },
                fromEmail: { type: String },
                active: { type: Boolean, default: false },
            },
            sms: {
                provider: { type: String, enum: ['twilio', 'msg91'], default: 'twilio' },
                accountSid: { type: String },
                authToken: { type: String },
                fromNumber: { type: String },
                active: { type: Boolean, default: false },
            },
            whatsapp: {
                provider: { type: String, enum: ['twilio', 'official'], default: 'twilio' },
                accountSid: { type: String },
                authToken: { type: String },
                fromNumber: { type: String },
                active: { type: Boolean, default: false },
            },
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
