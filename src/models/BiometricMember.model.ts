import mongoose, { Schema, Document } from 'mongoose';

export interface IBiometricMember extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    deviceId: mongoose.Types.ObjectId;
    enrollmentData: {
        type: 'fingerprint' | 'face' | 'card' | 'pin';
        template?: string; // encrypted biometric template
        cardNumber?: string;
        pin?: string; // hashed
        enrolledAt: Date;
        enrolledBy: mongoose.Types.ObjectId;
    }[];
    isActive: boolean;
    lastUsed?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricMemberSchema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        deviceId: { type: Schema.Types.ObjectId, ref: 'BiometricDevice', required: true },
        enrollmentData: [
            {
                type: { type: String, enum: ['fingerprint', 'face', 'card', 'pin'], required: true },
                template: String,
                cardNumber: String,
                pin: String,
                enrolledAt: { type: Date, default: Date.now },
                enrolledBy: { type: Schema.Types.ObjectId, ref: 'User' },
            },
        ],
        isActive: { type: Boolean, default: true },
        lastUsed: Date,
    },
    { timestamps: true }
);

BiometricMemberSchema.index({ tenantId: 1, memberId: 1, deviceId: 1 }, { unique: true });

export default mongoose.model<IBiometricMember>('BiometricMember', BiometricMemberSchema);
