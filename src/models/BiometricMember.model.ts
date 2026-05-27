import mongoose, { Schema, Document } from 'mongoose';

export interface IBiometricMember extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    biometricUserId: string;       // device ENROLLID (e.g. "1", "00042")
    faceId?: string;
    fingerprintId?: string;
    rfidCardId?: string;
    pinCode?: string;
    assignedDeviceIds: mongoose.Types.ObjectId[];
    active: boolean;
    lastPunchAt?: Date;
    lastPunchDeviceId?: mongoose.Types.ObjectId;
    enrolledBy?: mongoose.Types.ObjectId;
    enrolledAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricMemberSchema = new Schema<IBiometricMember>(
    {
        tenantId:         { type: Schema.Types.ObjectId, ref: 'Tenant',  required: true, index: true },
        memberId:         { type: Schema.Types.ObjectId, ref: 'Member',  required: true, index: true },
        biometricUserId:  { type: String, required: true, trim: true },
        faceId:           { type: String, trim: true },
        fingerprintId:    { type: String, trim: true },
        rfidCardId:       { type: String, trim: true },
        pinCode:          { type: String, trim: true },
        assignedDeviceIds: [{ type: Schema.Types.ObjectId, ref: 'BiometricDevice' }],
        active:           { type: Boolean, default: true, index: true },
        lastPunchAt:      { type: Date },
        lastPunchDeviceId: { type: Schema.Types.ObjectId, ref: 'BiometricDevice' },
        enrolledBy:       { type: Schema.Types.ObjectId, ref: 'User' },
        enrolledAt:       { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// One biometricUserId per tenant (one device-user = one gym member)
BiometricMemberSchema.index({ tenantId: 1, biometricUserId: 1 }, { unique: true });
// One biometric mapping per member
BiometricMemberSchema.index({ memberId: 1 }, { unique: true });
BiometricMemberSchema.index({ tenantId: 1, rfidCardId: 1 }, { sparse: true });
BiometricMemberSchema.index({ tenantId: 1, pinCode: 1 },    { sparse: true });

async function migrateSchema() {
    try {
        const col = mongoose.connection.collection('biometricmembers');
        // Rename isActive → active for existing records
        await col.updateMany(
            { isActive: { $exists: true }, active: { $exists: false } },
            [{ $set: { active: '$isActive' } }, { $unset: 'isActive' }] as any
        );
        // Drop stale compound indexes from old schema
        const indexes = await col.indexes();
        for (const idx of indexes) {
            if (
                idx.name === 'tenantId_1_memberId_1_deviceId_1' ||
                idx.name === 'deviceId_1_biometricUid_1' ||
                (idx.name === 'tenantId_1_biometricUserId_1' && !idx.unique)
            ) {
                await col.dropIndex(idx.name).catch(() => {});
            }
        }
    } catch { /* non-critical — collection may not exist yet */ }
}

if (mongoose.connection.readyState === 1) {
    migrateSchema();
} else {
    mongoose.connection.once('open', () => migrateSchema());
}

export default mongoose.models.BiometricMember as mongoose.Model<IBiometricMember>
    || mongoose.model<IBiometricMember>('BiometricMember', BiometricMemberSchema);
