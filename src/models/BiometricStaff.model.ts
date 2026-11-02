import mongoose, { Schema, Document } from 'mongoose';

/**
 * Maps a biometric device user ID to a staff member (trainer, receptionist, etc.).
 * Device user IDs share one namespace per tenant with BiometricMember, so the
 * enrol endpoints reject an ID that is already used on either side.
 */
export interface IBiometricStaff extends Document {
    tenantId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;       // User._id of the trainer / staff member
    biometricUserId: string;               // device ENROLLID, normalised (e.g. "7")
    assignedDeviceIds: mongoose.Types.ObjectId[];
    active: boolean;
    lastPunchAt?: Date;
    lastPunchDeviceId?: mongoose.Types.ObjectId;
    enrolledBy?: mongoose.Types.ObjectId;
    enrolledAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricStaffSchema = new Schema<IBiometricStaff>(
    {
        tenantId:          { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
        biometricUserId:   { type: String, required: true, trim: true },
        assignedDeviceIds: [{ type: Schema.Types.ObjectId, ref: 'BiometricDevice' }],
        active:            { type: Boolean, default: true, index: true },
        lastPunchAt:       { type: Date },
        lastPunchDeviceId: { type: Schema.Types.ObjectId, ref: 'BiometricDevice' },
        enrolledBy:        { type: Schema.Types.ObjectId, ref: 'User' },
        enrolledAt:        { type: Date, default: Date.now },
    },
    { timestamps: true }
);

BiometricStaffSchema.index({ tenantId: 1, biometricUserId: 1 }, { unique: true });
BiometricStaffSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export default (mongoose.models.BiometricStaff as mongoose.Model<IBiometricStaff>) ||
    mongoose.model<IBiometricStaff>('BiometricStaff', BiometricStaffSchema);
