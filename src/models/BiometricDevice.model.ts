import mongoose, { Schema, Document } from 'mongoose';

export interface IBiometricDevice extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    // Reference-compatible primary fields
    deviceName: string;
    deviceBrand: 'zkteco' | 'essl' | 'matrix' | 'realtime' | 'generic';
    deviceModel?: string;
    deviceType: 'fingerprint' | 'face' | 'rfid' | 'pin' | 'hybrid';
    syncMode: 'realtime' | 'scheduled' | 'manual';
    syncIntervalMinutes: number;
    timezone: string;
    // Legacy field aliases (kept for backward compat, populated from primary fields)
    name?: string;
    vendor?: string;
    type?: string;
    // Common fields
    deviceId?: string;
    serialNumber?: string;
    ipAddress?: string;
    port?: number;
    password?: string;
    location?: string;
    firmwareVersion?: string;
    status: 'active' | 'online' | 'offline' | 'error' | 'syncing' | 'maintenance';
    lastSeenAt?: Date;
    lastPing?: Date;
    lastSyncAt?: Date;
    lastSync?: Date;
    lastSyncCursor?: string;
    consecutiveFailures?: number;
    lastErrorMessage?: string;
    totalRecordsFetched?: number;
    enrolledMembers?: number;
    isActive: boolean;
    isDeleted?: boolean;
    settings?: {
        timezone?: string;
        autoSync?: boolean;
        syncInterval?: number;
        verificationMode?: string;
        accessControl?: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}

const BiometricDeviceSchema = new Schema<IBiometricDevice>(
    {
        tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId:  { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

        // Primary (reference-compatible) fields
        deviceName:          { type: String },
        deviceBrand:         { type: String, enum: ['zkteco', 'essl', 'matrix', 'realtime', 'generic'], default: 'generic' },
        deviceModel:         { type: String },
        deviceType:          { type: String, enum: ['fingerprint', 'face', 'rfid', 'pin', 'hybrid'], default: 'fingerprint' },
        syncMode:            { type: String, enum: ['realtime', 'scheduled', 'manual'], default: 'scheduled' },
        syncIntervalMinutes: { type: Number, default: 5, min: 1, max: 1440 },
        timezone:            { type: String, default: 'Asia/Kolkata' },

        // Legacy aliases — kept so existing documents/code still works
        name:   { type: String },
        vendor: { type: String, enum: ['zkteco', 'essl', 'suprema', 'matrix', 'realtime', 'generic'] },
        type:   { type: String, enum: ['fingerprint', 'face', 'rfid', 'card', 'pin', 'hybrid'] },

        deviceId:      { type: String },
        serialNumber:  { type: String },
        ipAddress:     { type: String },
        port:          { type: Number, default: 4370 },
        password:      { type: String },
        location:      { type: String },
        firmwareVersion: { type: String },

        status: {
            type: String,
            enum: ['active', 'online', 'offline', 'error', 'syncing', 'maintenance'],
            default: 'offline',
        },

        lastSeenAt:          { type: Date },
        lastPing:            { type: Date },
        lastSyncAt:          { type: Date },
        lastSync:            { type: Date },
        lastSyncCursor:      { type: String },
        consecutiveFailures: { type: Number, default: 0 },
        lastErrorMessage:    { type: String },
        totalRecordsFetched: { type: Number, default: 0 },
        enrolledMembers:     { type: Number, default: 0 },
        isActive:            { type: Boolean, default: true },
        isDeleted:           { type: Boolean, default: false },

        // Legacy nested settings — kept for backward compat
        settings: {
            timezone:         { type: String, default: 'Asia/Kolkata' },
            autoSync:         { type: Boolean, default: true },
            syncInterval:     { type: Number, default: 30 },
            verificationMode: { type: String, enum: ['finger', 'face', 'card', 'pin', 'multi'], default: 'finger' },
            accessControl:    { type: Boolean, default: false },
        },
    },
    { timestamps: true }
);

// Pre-save: sync legacy ↔ primary field names so both are always populated
BiometricDeviceSchema.pre('save', function () {
    // deviceName ↔ name
    if (this.deviceName && !this.name) this.name = this.deviceName;
    else if (this.name && !this.deviceName) this.deviceName = this.name;
    // deviceBrand ↔ vendor
    if (this.deviceBrand && !this.vendor) this.vendor = this.deviceBrand as any;
    else if (this.vendor && !this.deviceBrand) this.deviceBrand = this.vendor as any;
    // deviceType ↔ type
    if (this.deviceType && !this.type) this.type = this.deviceType;
    else if (this.type && !this.deviceType) this.deviceType = this.type as any;
    // timezone ↔ settings.timezone
    if (this.timezone && this.settings && !this.settings.timezone) this.settings.timezone = this.timezone;
    else if (this.settings?.timezone && !this.timezone) this.timezone = this.settings.timezone;
});

BiometricDeviceSchema.index({ tenantId: 1, branchId: 1 });
BiometricDeviceSchema.index({ tenantId: 1, status: 1 });
BiometricDeviceSchema.index({ tenantId: 1, isDeleted: 1 });
BiometricDeviceSchema.index({ tenantId: 1, deviceId: 1 }, { unique: true, sparse: true });
BiometricDeviceSchema.index({ serialNumber: 1 }, { sparse: true });

// One-time migration: backfill null deviceIds + sync field aliases for legacy documents
async function migrateDevices() {
    try {
        const col = mongoose.connection.collection('biometricdevices');

        // Fix null deviceIds
        const nullDocs = await col.find({ deviceId: { $in: [null, undefined] } }, { projection: { _id: 1 } }).toArray();
        for (const doc of nullDocs) {
            await col.updateOne({ _id: doc._id }, { $set: { deviceId: new mongoose.Types.ObjectId().toString() } });
        }

        // Drop stale non-sparse unique index on deviceId if it exists
        try {
            const indexes = await col.indexes();
            const stale = indexes.find((i: any) => i.name === 'tenantId_1_deviceId_1' && !i.sparse);
            if (stale) await col.dropIndex('tenantId_1_deviceId_1');
        } catch { /* already gone */ }

        // Backfill: copy name → deviceName for legacy docs that only have `name`
        await col.updateMany(
            { name: { $exists: true, $ne: null }, deviceName: { $in: [null, undefined, ''] } },
            [{ $set: { deviceName: '$name' } }]
        );
        // Backfill: vendor → deviceBrand
        await col.updateMany(
            { vendor: { $exists: true, $ne: null }, deviceBrand: { $in: [null, undefined, ''] } },
            [{ $set: { deviceBrand: '$vendor' } }]
        );
        // Backfill: type → deviceType (legacy 'card' → 'rfid')
        await col.updateMany(
            { type: { $exists: true, $ne: null }, deviceType: { $in: [null, undefined, ''] } },
            [{ $set: { deviceType: { $cond: [{ $eq: ['$type', 'card'] }, 'rfid', '$type'] } } }]
        );
        // Backfill: settings.timezone → timezone
        await col.updateMany(
            { 'settings.timezone': { $exists: true, $ne: null }, timezone: { $in: [null, undefined, ''] } },
            [{ $set: { timezone: '$settings.timezone' } }]
        );
        // Backfill: status 'online' → 'active'
        await col.updateMany({ status: 'online' }, { $set: { status: 'active' } });

    } catch { /* migration errors are non-fatal */ }
}

if (mongoose.connection.readyState === 1) {
    migrateDevices();
} else {
    mongoose.connection.once('open', () => migrateDevices());
}

export default mongoose.models.BiometricDevice as mongoose.Model<IBiometricDevice>
    || mongoose.model<IBiometricDevice>('BiometricDevice', BiometricDeviceSchema);
