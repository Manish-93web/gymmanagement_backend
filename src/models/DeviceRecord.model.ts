import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceRecord extends Document {
    tenantId: string;
    memberId: string;
    userId: string;
    deviceId: string;
    deviceName?: string;
    platform: 'ios' | 'android' | 'web';
    appVersion?: string;
    osVersion?: string;
    isTrusted: boolean;
    isBlocked: boolean;
    firstSeenAt: Date;
    lastSeenAt: Date;
    lastCheckInAt?: Date;
    lastLocation?: {
        lat: number;
        lng: number;
        city?: string;
        country?: string;
    };
    loginCount: number;
    trustVerifiedAt?: Date;
    blockedAt?: Date;
    blockedReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const DeviceRecordSchema: Schema = new Schema(
    {
        tenantId: { type: String, required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        deviceId: { type: String, required: true },
        deviceName: { type: String },
        platform: {
            type: String,
            enum: ['ios', 'android', 'web'],
            required: true,
        },
        appVersion: { type: String },
        osVersion: { type: String },
        isTrusted: { type: Boolean, default: false },
        isBlocked: { type: Boolean, default: false },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        lastCheckInAt: { type: Date },
        lastLocation: {
            lat: { type: Number },
            lng: { type: Number },
            city: { type: String },
            country: { type: String },
        },
        loginCount: { type: Number, default: 0 },
        trustVerifiedAt: { type: Date },
        blockedAt: { type: Date },
        blockedReason: { type: String },
    },
    { timestamps: true }
);

// Indexes
DeviceRecordSchema.index({ tenantId: 1, memberId: 1 });
DeviceRecordSchema.index({ tenantId: 1, userId: 1, deviceId: 1 }, { unique: true });
DeviceRecordSchema.index({ deviceId: 1 });
DeviceRecordSchema.index({ tenantId: 1, isTrusted: 1 });

export default mongoose.model<IDeviceRecord>('DeviceRecord', DeviceRecordSchema);
