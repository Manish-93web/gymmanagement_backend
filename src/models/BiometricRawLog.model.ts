import mongoose, { Schema, Document } from 'mongoose';

export type PunchEventType = 'check_in' | 'check_out' | 'overtime_in' | 'overtime_out' | 'unknown';

export interface IBiometricRawLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    deviceId: mongoose.Types.ObjectId;
    biometricUserId: string;
    eventType: PunchEventType;
    punchTime: Date;
    deviceLocalTime?: string;
    rawPayload?: Record<string, any>;
    processed: boolean;
    processedAt?: Date;
    attendanceId?: mongoose.Types.ObjectId;
    skippedReason?: string;
    createdAt: Date;
}

const BiometricRawLogSchema = new Schema<IBiometricRawLog>(
    {
        tenantId:        { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId:        { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        deviceId:        { type: Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
        biometricUserId: { type: String, required: true, index: true },
        eventType:       { type: String, enum: ['check_in', 'check_out', 'overtime_in', 'overtime_out', 'unknown'], default: 'unknown' },
        punchTime:       { type: Date, required: true, index: true },
        deviceLocalTime: { type: String },
        rawPayload:      { type: Schema.Types.Mixed },
        processed:       { type: Boolean, default: false, index: true },
        processedAt:     { type: Date },
        attendanceId:    { type: Schema.Types.ObjectId, ref: 'Attendance' },
        skippedReason:   { type: String },
    },
    { timestamps: true, versionKey: false }
);

BiometricRawLogSchema.index({ tenantId: 1, processed: 1, punchTime: -1 });
BiometricRawLogSchema.index({ deviceId: 1, punchTime: -1 });
BiometricRawLogSchema.index({ tenantId: 1, deviceId: 1, punchTime: -1 }); // tenant-scoped device log listing
BiometricRawLogSchema.index({ deviceId: 1, biometricUserId: 1, punchTime: 1 }, { unique: true }); // dedup punches
BiometricRawLogSchema.index({ tenantId: 1, skippedReason: 1, createdAt: -1 }); // unmatched punch queries

export default (mongoose.models.BiometricRawLog as mongoose.Model<IBiometricRawLog>) ||
    mongoose.model<IBiometricRawLog>('BiometricRawLog', BiometricRawLogSchema);
