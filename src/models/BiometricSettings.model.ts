import mongoose, { Schema, Document } from 'mongoose';

export interface IBiometricSettings extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    dedupeWindowMinutes: number;
    autoCheckoutEnabled: boolean;
    autoCheckoutAfterMinutes: number;
    shiftStartTime: string;
    shiftEndTime: string;
    graceLateMinutes: number;
    timezone: string;
    attendanceSourcePriority: ('biometric' | 'qr' | 'manual')[];
    alertOnDeviceOfflineMinutes: number;
    alertOnSyncFailureCount: number;
    alertOnUnmatchedSpike: number;
    peakCrowdThreshold: number;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricSettingsSchema = new Schema<IBiometricSettings>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
        dedupeWindowMinutes:         { type: Number, default: 5,   min: 1 },
        autoCheckoutEnabled:         { type: Boolean, default: true },
        autoCheckoutAfterMinutes:    { type: Number, default: 180, min: 30 },
        shiftStartTime:              { type: String, default: '06:00' },
        shiftEndTime:                { type: String, default: '22:00' },
        graceLateMinutes:            { type: Number, default: 15 },
        timezone:                    { type: String, default: 'Asia/Kolkata' },
        attendanceSourcePriority:    { type: [String], default: ['biometric', 'qr', 'manual'] },
        alertOnDeviceOfflineMinutes: { type: Number, default: 10 },
        alertOnSyncFailureCount:     { type: Number, default: 3 },
        alertOnUnmatchedSpike:       { type: Number, default: 10 },
        peakCrowdThreshold:          { type: Number, default: 50 },
    },
    { timestamps: true }
);

BiometricSettingsSchema.index({ tenantId: 1, branchId: 1 }, { unique: true, sparse: true });

export default (mongoose.models.BiometricSettings as mongoose.Model<IBiometricSettings>) ||
    mongoose.model<IBiometricSettings>('BiometricSettings', BiometricSettingsSchema);
