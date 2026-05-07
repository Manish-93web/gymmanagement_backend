import mongoose, { Schema, Document } from 'mongoose';

export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';
export type SyncTrigger = 'scheduled' | 'manual' | 'webhook' | 'retry';

export interface IBiometricSyncJob extends Document {
    tenantId: mongoose.Types.ObjectId;
    deviceId: mongoose.Types.ObjectId;
    trigger: SyncTrigger;
    startedAt: Date;
    endedAt?: Date;
    durationSeconds?: number;
    fromCursor?: string;
    toCursor?: string;
    recordsFetched: number;
    recordsCreated: number;
    recordsDuplicate: number;
    recordsUnmatched: number;
    failedCount: number;
    status: SyncJobStatus;
    errorMessage?: string;
    errorStack?: string;
    retryCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const BiometricSyncJobSchema = new Schema<IBiometricSyncJob>(
    {
        tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        deviceId:  { type: Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
        trigger:   { type: String, enum: ['scheduled', 'manual', 'webhook', 'retry'], default: 'scheduled' },
        startedAt: { type: Date, required: true },
        endedAt:   { type: Date },
        durationSeconds:  { type: Number },
        fromCursor:       { type: String },
        toCursor:         { type: String },
        recordsFetched:   { type: Number, default: 0 },
        recordsCreated:   { type: Number, default: 0 },
        recordsDuplicate: { type: Number, default: 0 },
        recordsUnmatched: { type: Number, default: 0 },
        failedCount:      { type: Number, default: 0 },
        status:       { type: String, enum: ['pending', 'running', 'completed', 'failed', 'partial'], default: 'pending' },
        errorMessage: { type: String },
        errorStack:   { type: String },
        retryCount:   { type: Number, default: 0 },
    },
    { timestamps: true }
);

BiometricSyncJobSchema.index({ tenantId: 1, deviceId: 1, startedAt: -1 });
BiometricSyncJobSchema.index({ status: 1, startedAt: -1 });

export default (mongoose.models.BiometricSyncJob as mongoose.Model<IBiometricSyncJob>) ||
    mongoose.model<IBiometricSyncJob>('BiometricSyncJob', BiometricSyncJobSchema);
