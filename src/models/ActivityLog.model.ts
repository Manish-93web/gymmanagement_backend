import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
    userId: mongoose.Types.ObjectId;
    action: string;
    resource: string;
    resourceId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    tenantId: mongoose.Types.ObjectId;
    timestamp: Date;
}

const ActivityLogSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        action: { type: String, required: true, index: true },
        resource: { type: String, required: true, index: true },
        resourceId: { type: String },
        details: { type: Schema.Types.Mixed },
        ipAddress: { type: String },
        userAgent: { type: String },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        timestamp: { type: Date, default: Date.now, index: true },
    },
    { timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

// Indexes
ActivityLogSchema.index({ tenantId: 1, timestamp: -1 });
ActivityLogSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
