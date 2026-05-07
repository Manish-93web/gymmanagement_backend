import mongoose, { Schema, Document } from 'mongoose';

export interface IPlatformConfig extends Document {
    branding: {
        platformName: string;
        supportEmail: string;
        supportPhone: string;
        logo?: string;
        favicon?: string;
        primaryColor: string;
        secondaryColor: string;
    };
    features: {
        maintenanceMode: boolean;
        publicRegistration: boolean;
        aiEnabled: boolean;
        notificationsEnabled: boolean;
    };
    attendance: {
        maxStayMinutes: number;
        geoFenceRadius: number;
        requireGeoLocation: boolean;
        allowManualOverride: boolean;
    };
    security: {
        maxLoginAttempts: number;
        sessionTimeout: number;
        requireTwoFactor: boolean;
    };
    integrations: {
        razorpay: { keyId: string; keySecret: string; enabled: boolean };
        stripe: { publishableKey: string; secretKey: string; enabled: boolean };
        twilio: { accountSid: string; authToken: string; fromNumber: string; enabled: boolean };
        smtp: { host: string; port: number; user: string; pass: string; fromName: string; fromEmail: string; secure: boolean };
        openai: { apiKey: string; model: string; enabled: boolean };
    };
    createdAt: Date;
    updatedAt: Date;
}

const PlatformConfigSchema = new Schema<IPlatformConfig>(
    {
        branding: {
            platformName:   { type: String, default: 'GYM.OS' },
            supportEmail:   { type: String, default: 'support@gymos.ai' },
            supportPhone:   { type: String, default: '' },
            logo:           { type: String },
            favicon:        { type: String },
            primaryColor:   { type: String, default: '#6366f1' },
            secondaryColor: { type: String, default: '#8b5cf6' },
        },
        features: {
            maintenanceMode:      { type: Boolean, default: false },
            publicRegistration:   { type: Boolean, default: true },
            aiEnabled:            { type: Boolean, default: true },
            notificationsEnabled: { type: Boolean, default: true },
        },
        attendance: {
            maxStayMinutes:     { type: Number, default: 180 },
            geoFenceRadius:     { type: Number, default: 500 },
            requireGeoLocation: { type: Boolean, default: false },
            allowManualOverride: { type: Boolean, default: true },
        },
        security: {
            maxLoginAttempts:  { type: Number, default: 5 },
            sessionTimeout:    { type: Number, default: 3600 },
            requireTwoFactor:  { type: Boolean, default: false },
        },
        integrations: {
            razorpay: {
                keyId:     { type: String, default: '' },
                keySecret: { type: String, default: '', select: false },
                enabled:   { type: Boolean, default: false },
            },
            stripe: {
                publishableKey: { type: String, default: '' },
                secretKey:      { type: String, default: '', select: false },
                enabled:        { type: Boolean, default: false },
            },
            twilio: {
                accountSid: { type: String, default: '' },
                authToken:  { type: String, default: '', select: false },
                fromNumber: { type: String, default: '' },
                enabled:    { type: Boolean, default: false },
            },
            smtp: {
                host:      { type: String, default: '' },
                port:      { type: Number, default: 587 },
                user:      { type: String, default: '' },
                pass:      { type: String, default: '', select: false },
                fromName:  { type: String, default: 'GYM.OS' },
                fromEmail: { type: String, default: 'noreply@gymos.ai' },
                secure:    { type: Boolean, default: false },
            },
            openai: {
                apiKey:  { type: String, default: '', select: false },
                model:   { type: String, default: 'gpt-4o' },
                enabled: { type: Boolean, default: false },
            },
        },
    },
    { timestamps: true }
);

export default (mongoose.models.PlatformConfig as mongoose.Model<IPlatformConfig>) ||
    mongoose.model<IPlatformConfig>('PlatformConfig', PlatformConfigSchema);
