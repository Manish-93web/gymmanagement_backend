import mongoose, { Document, Schema } from 'mongoose';

/**
 * The face template of one trainer or staff member, used for face check-in on the gym's phone.
 * It is 128 numbers computed in the browser from the camera image. The photo itself is never sent or stored,
 * and the numbers cannot be turned back into a picture. Kept apart from the user record so ordinary
 * queries never carry it.
 */
export interface IStaffFace extends Document {
    tenantId: mongoose.Types.ObjectId;
    staffId: mongoose.Types.ObjectId;
    descriptors: number[][];       // 3 to 8 captures, each 128 numbers
    enrolledBy?: string;
    enrolledAt: Date;
    failedAttempts: number;        // wrong-face attempts in a row
    lockedUntil?: Date;            // check-in by face paused after too many wrong attempts
    lastMatchAt?: Date;
}

const staffFaceSchema = new Schema<IStaffFace>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        descriptors: { type: [[Number]], required: true, select: false },
        enrolledBy: String,
        enrolledAt: { type: Date, default: Date.now },
        failedAttempts: { type: Number, default: 0 },
        lockedUntil: Date,
        lastMatchAt: Date,
    },
    { timestamps: true }
);

staffFaceSchema.index({ tenantId: 1, staffId: 1 }, { unique: true });

export default mongoose.model<IStaffFace>('StaffFace', staffFaceSchema);
