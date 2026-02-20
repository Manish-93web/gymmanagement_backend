import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationPreference extends Document {
    userId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    email: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reports: boolean;
    };
    sms: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reminders: boolean;
    };
    whatsapp: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reminders: boolean;
    };
    push: {
        enabled: boolean;
        updates: boolean;
        reminders: boolean;
    };
    frequency: {
        dailyDigest: boolean;
        weeklyReport: boolean;
        monthlyReport: boolean;
    };
    quietHours: {
        enabled: boolean;
        start: string; // HH:mm
        end: string;   // HH:mm
    };
    createdAt: Date;
    updatedAt: Date;
}

const NotificationPreferenceSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        email: {
            enabled: { type: Boolean, default: true },
            marketing: { type: Boolean, default: true },
            transactional: { type: Boolean, default: true },
            reports: { type: Boolean, default: true },
        },
        sms: {
            enabled: { type: Boolean, default: false },
            marketing: { type: Boolean, default: false },
            transactional: { type: Boolean, default: true },
            reminders: { type: Boolean, default: true },
        },
        whatsapp: {
            enabled: { type: Boolean, default: false },
            marketing: { type: Boolean, default: false },
            transactional: { type: Boolean, default: true },
            reminders: { type: Boolean, default: true },
        },
        push: {
            enabled: { type: Boolean, default: true },
            updates: { type: Boolean, default: true },
            reminders: { type: Boolean, default: true },
        },
        frequency: {
            dailyDigest: { type: Boolean, default: false },
            weeklyReport: { type: Boolean, default: true },
            monthlyReport: { type: Boolean, default: true },
        },
        quietHours: {
            enabled: { type: Boolean, default: false },
            start: { type: String, default: '22:00' },
            end: { type: String, default: '08:00' },
        },
    },
    { timestamps: true }
);

// Indexes
NotificationPreferenceSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

export default mongoose.model<INotificationPreference>('NotificationPreference', NotificationPreferenceSchema);
