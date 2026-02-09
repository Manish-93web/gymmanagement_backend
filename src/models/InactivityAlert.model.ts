import mongoose, { Schema, Document } from 'mongoose';

export interface IInactivityAlert extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    level: 'warning' | 'critical' | 'churned';
    daysInactive: number;
    lastAttendanceDate: Date;
    status: 'pending' | 'contacted' | 'resolved' | 'ignored';
    notes?: string;
    createdAt: Date;
}

const InactivityAlertSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        level: {
            type: String,
            enum: ['warning', 'critical', 'churned'],
            required: true,
        },
        daysInactive: { type: Number, required: true },
        lastAttendanceDate: { type: Date, required: true },
        status: {
            type: String,
            enum: ['pending', 'contacted', 'resolved', 'ignored'],
            default: 'pending',
        },
        notes: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model<IInactivityAlert>('InactivityAlert', InactivityAlertSchema);
