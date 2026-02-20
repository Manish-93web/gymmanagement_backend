import mongoose, { Schema, Document } from 'mongoose';

export interface ICallLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    direction: 'inbound' | 'outbound';
    startTime: Date;
    endTime?: Date;
    duration?: number; // in seconds
    status: 'completed' | 'missed' | 'busy' | 'no-answer' | 'failed';
    notes?: string;
    recordingUrl?: string;
    summary?: string;
    actionTaken?: string;
    nextFollowUp?: Date;
    followUpRequired?: boolean;
    followUpCompleted?: boolean;
    followUpCompletedAt?: Date;
    followUpNotes?: string;
    purpose?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CallLogSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
        startTime: { type: Date, required: true, default: Date.now },
        endTime: { type: Date },
        duration: { type: Number },
        status: {
            type: String,
            enum: ['completed', 'missed', 'busy', 'no-answer', 'failed'],
            required: true,
            default: 'completed',
        },
        notes: { type: String },
        recordingUrl: { type: String },
        summary: { type: String },
        actionTaken: { type: String },
        nextFollowUp: { type: Date },
        followUpRequired: { type: Boolean, default: false },
        followUpCompleted: { type: Boolean, default: false },
        followUpCompletedAt: { type: Date },
        followUpNotes: { type: String },
        purpose: { type: String },
    },
    { timestamps: true }
);

// Indexes
CallLogSchema.index({ tenantId: 1, startTime: -1 });
CallLogSchema.index({ memberId: 1, startTime: -1 });
CallLogSchema.index({ userId: 1, startTime: -1 });

export default mongoose.model<ICallLog>('CallLog', CallLogSchema);
