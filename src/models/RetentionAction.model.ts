import mongoose, { Schema, Document } from 'mongoose';

export interface IRetentionAction extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    type: 'message' | 'call' | 'offer' | 'meeting';
    status: 'pending' | 'completed' | 'cancelled';
    notes?: string;
    performedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    completedAt?: Date;
}

const RetentionActionSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        type: {
            type: String,
            enum: ['message', 'call', 'offer', 'meeting'],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'cancelled'],
            default: 'pending',
        },
        notes: { type: String },
        performedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Staff who performed the action
        completedAt: { type: Date },
    },
    { timestamps: true }
);

export default mongoose.model<IRetentionAction>('RetentionAction', RetentionActionSchema);
