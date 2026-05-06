import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportTicket extends Document {
    tenantId?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    subject: string;
    description: string;
    category: 'billing' | 'technical' | 'feature_request' | 'bug' | 'other';
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
    assignedTo?: mongoose.Types.ObjectId;
    replies: {
        userId: mongoose.Types.ObjectId;
        message: string;
        isStaff: boolean;
        createdAt: Date;
    }[];
    resolvedAt?: Date;
    closedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const SupportTicketSchema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        subject: { type: String, required: true },
        description: { type: String, required: true },
        category: { type: String, enum: ['billing', 'technical', 'feature_request', 'bug', 'other'], default: 'other' },
        priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        status: { type: String, enum: ['open', 'in_progress', 'waiting', 'resolved', 'closed'], default: 'open' },
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
        replies: [{
            userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            message: { type: String, required: true },
            isStaff: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now },
        }],
        resolvedAt: Date,
        closedAt: Date,
    },
    { timestamps: true }
);

SupportTicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
