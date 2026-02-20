import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
    tenantId: mongoose.Types.ObjectId;
    general: {
        siteName: string;
        siteUrl: string;
        supportEmail: string;
        supportPhone: string;
        timezone: string;
        currency: string;
        language: string;
    };
    branding: {
        logo: string;
        favicon: string;
        primaryColor: string;
        secondaryColor: string;
        customCSS?: string;
    };
    features: {
        enableWhatsApp: boolean;
        enableSMS: boolean;
        enableAI: boolean;
        enableCalendarSync: boolean;
        enableBiometric: boolean;
        enableQRCode: boolean;
    };
    payment: {
        razorpayEnabled: boolean;
        stripeEnabled: boolean;
        defaultGateway: 'razorpay' | 'stripe';
        currency: string;
        taxRate: number;
    };
    notifications: {
        emailProvider: 'smtp' | 'sendgrid' | 'mailgun';
        smsProvider: 'twilio' | 'msg91';
        whatsappProvider: 'twilio';
    };
    security: {
        sessionTimeout: number;
        maxLoginAttempts: number;
        passwordMinLength: number;
        requireTwoFactor: boolean;
        allowedIPs?: string[];
    };
    limits: {
        maxMembersPerBranch: number;
        maxClassesPerDay: number;
        maxTrainersPerBranch: number;
        storageLimit: number; // in MB
    };
    createdAt: Date;
    updatedAt: Date;
}

const SystemConfigSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        general: {
            siteName: { type: String, required: true },
            siteUrl: { type: String, required: true },
            supportEmail: { type: String, required: true },
            supportPhone: { type: String, required: true },
            timezone: { type: String, default: 'UTC' },
            currency: { type: String, default: 'USD' },
            language: { type: String, default: 'en' },
        },
        branding: {
            logo: { type: String },
            favicon: { type: String },
            primaryColor: { type: String, default: '#000000' },
            secondaryColor: { type: String, default: '#ffffff' },
            customCSS: { type: String },
        },
        features: {
            enableWhatsApp: { type: Boolean, default: false },
            enableSMS: { type: Boolean, default: false },
            enableAI: { type: Boolean, default: false },
            enableCalendarSync: { type: Boolean, default: false },
            enableBiometric: { type: Boolean, default: false },
            enableQRCode: { type: Boolean, default: false },
        },
        payment: {
            razorpayEnabled: { type: Boolean, default: false },
            stripeEnabled: { type: Boolean, default: false },
            defaultGateway: { type: String, enum: ['razorpay', 'stripe'], default: 'stripe' },
            currency: { type: String, default: 'USD' },
            taxRate: { type: Number, default: 0 },
        },
        notifications: {
            emailProvider: { type: String, enum: ['smtp', 'sendgrid', 'mailgun'], default: 'smtp' },
            smsProvider: { type: String, enum: ['twilio', 'msg91'], default: 'twilio' },
            whatsappProvider: { type: String, enum: ['twilio'], default: 'twilio' },
        },
        security: {
            sessionTimeout: { type: Number, default: 3600 },
            maxLoginAttempts: { type: Number, default: 5 },
            passwordMinLength: { type: Number, default: 8 },
            requireTwoFactor: { type: Boolean, default: false },
            allowedIPs: [{ type: String }],
        },
        limits: {
            maxMembersPerBranch: { type: Number, default: 100 },
            maxClassesPerDay: { type: Number, default: 10 },
            maxTrainersPerBranch: { type: Number, default: 5 },
            storageLimit: { type: Number, default: 1024 },
        },
    },
    { timestamps: true }
);

// Indexes
SystemConfigSchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
