import mongoose, { Schema, Document } from 'mongoose';

export type CheckInMethod = 'manual' | 'qr' | 'rfid' | 'biometric' | 'mobile_app';

export interface IAttendance extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    checkInTime: Date;
    checkOutTime?: Date;
    duration?: number; // in minutes
    method: CheckInMethod;
    deviceId?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    isOverstay: boolean;
    overstayMinutes?: number;
    isFraudulent: boolean;
    fraudReason?: string;
    classId?: mongoose.Types.ObjectId;
    trainerId?: mongoose.Types.ObjectId;
    notes: string;
    recordedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        checkInTime: { type: Date, required: true, index: true },
        checkOutTime: { type: Date },
        duration: { type: Number },
        method: {
            type: String,
            enum: ['manual', 'qr', 'rfid', 'biometric', 'mobile_app'],
            required: true,
        },
        deviceId: { type: String },
        location: {
            latitude: { type: Number },
            longitude: { type: Number },
        },
        isOverstay: { type: Boolean, default: false },
        overstayMinutes: { type: Number },
        isFraudulent: { type: Boolean, default: false },
        fraudReason: { type: String },
        classId: { type: Schema.Types.ObjectId, ref: 'Class' },
        trainerId: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: { type: String },
        recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Indexes
AttendanceSchema.index({ tenantId: 1, branchId: 1, checkInTime: -1 });
AttendanceSchema.index({ memberId: 1, checkInTime: -1 });
AttendanceSchema.index({ checkInTime: 1, checkOutTime: 1 });

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
