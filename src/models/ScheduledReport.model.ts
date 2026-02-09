import mongoose, { Schema, Document } from 'mongoose';

export interface IScheduledReport extends Document {
    name: string;
    reportId: mongoose.Types.ObjectId;
    schedule: string;
    format: 'pdf' | 'csv' | 'both';
    recipients: string[];
    filters?: any[];
    isActive: boolean;
    tenantId: mongoose.Types.ObjectId;
    lastRun?: Date;
    nextRun?: Date;
    runCount: number;
    errorCount: number;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ScheduledReportSchema = new Schema<IScheduledReport>(
    {
        name: { type: String, required: true },
        reportId: { type: Schema.Types.ObjectId, ref: 'CustomReport', required: true },
        schedule: { type: String, required: true },
        format: { type: String, enum: ['pdf', 'csv', 'both'], default: 'pdf' },
        recipients: [{ type: String, required: true }],
        filters: { type: Schema.Types.Mixed },
        isActive: { type: Boolean, default: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        lastRun: { type: Date },
        nextRun: { type: Date },
        runCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        lastError: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model<IScheduledReport>('ScheduledReport', ScheduledReportSchema);
