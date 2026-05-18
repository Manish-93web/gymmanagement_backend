import mongoose, { Schema, Document } from 'mongoose';

export interface IBiometricDevice extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    name: string;
    deviceId: string;
    type: 'fingerprint' | 'face' | 'rfid' | 'card' | 'hybrid';
    vendor: 'zkteco' | 'essl' | 'suprema' | 'generic';
    ipAddress?: string;
    port?: number;
    serialNumber?: string;
    location?: string;
    status: 'online' | 'offline' | 'error' | 'syncing';
    lastSync?: Date;
    lastPing?: Date;
    enrolledMembers: number;
    settings: {
        timezone?: string;
        autoSync: boolean;
        syncInterval: number; // minutes
        verificationMode: 'finger' | 'face' | 'card' | 'pin' | 'multi';
        accessControl: boolean;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricDeviceSchema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        name: { type: String, required: true },
        deviceId: { type: String },
        type: { type: String, enum: ['fingerprint', 'face', 'rfid', 'card', 'hybrid'], required: true },
        vendor: { type: String, enum: ['zkteco', 'essl', 'suprema', 'generic'], default: 'generic' },
        ipAddress: String,
        port: { type: Number, default: 4370 },
        serialNumber: String,
        location: String,
        status: { type: String, enum: ['online', 'offline', 'error', 'syncing'], default: 'offline' },
        lastSync: Date,
        lastPing: Date,
        enrolledMembers: { type: Number, default: 0 },
        settings: {
            timezone: { type: String, default: 'Asia/Kolkata' },
            autoSync: { type: Boolean, default: true },
            syncInterval: { type: Number, default: 30 },
            verificationMode: { type: String, enum: ['finger', 'face', 'card', 'pin', 'multi'], default: 'finger' },
            accessControl: { type: Boolean, default: false },
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

BiometricDeviceSchema.index({ tenantId: 1, branchId: 1 });
BiometricDeviceSchema.index({ tenantId: 1, status: 1 });
// sparse=true so devices without a deviceId (null/undefined) don't conflict
BiometricDeviceSchema.index({ tenantId: 1, deviceId: 1 }, { unique: true, sparse: true });

// One-time migration: backfill null deviceIds and drop the legacy non-sparse index
async function fixLegacyDeviceIdIndex() {
    try {
        const col = mongoose.connection.collection('biometricdevices');
        const nullDocs = await col.find({ deviceId: { $in: [null, undefined] } }, { projection: { _id: 1 } }).toArray();
        for (const doc of nullDocs) {
            await col.updateOne({ _id: doc._id }, { $set: { deviceId: new mongoose.Types.ObjectId().toString() } });
        }
        const indexes = await col.indexes();
        const stale = indexes.find((i: any) => i.name === 'tenantId_1_deviceId_1' && !i.sparse);
        if (stale) await col.dropIndex('tenantId_1_deviceId_1');
    } catch { /* already migrated or collection doesn't exist */ }
}

if (mongoose.connection.readyState === 1) {
    fixLegacyDeviceIdIndex();
} else {
    mongoose.connection.once('open', () => fixLegacyDeviceIdIndex());
}

export default mongoose.model<IBiometricDevice>('BiometricDevice', BiometricDeviceSchema);
