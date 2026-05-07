import mongoose, { Schema, Document } from 'mongoose';

export interface ISaaSTicketReply {
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    authorRole: string;
    message: string;
    repliedAt: Date;
    isInternal: boolean;
}

export interface ISaaSTicket extends Document {
    tenantId: mongoose.Types.ObjectId;
    gymName: string;
    ticketNo: string;
    subject: string;
    description: string;
    category: 'billing' | 'technical' | 'account' | 'feature_request' | 'other';
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    assignedTo?: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdByRole: string;
    replies: ISaaSTicketReply[];
    resolvedAt?: Date;
    closedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ReplySchema = new Schema<ISaaSTicketReply>(
    {
        authorId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, required: true },
        authorRole: { type: String, required: true },
        message:    { type: String, required: true },
        repliedAt:  { type: Date, default: Date.now },
        isInternal: { type: Boolean, default: false },
    },
    { _id: false }
);

const SaaSTicketSchema = new Schema<ISaaSTicket>(
    {
        tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        gymName:     { type: String, default: '' },
        ticketNo:    { type: String, unique: true },
        subject:     { type: String, required: true, trim: true },
        description: { type: String, required: true },
        category:    { type: String, enum: ['billing', 'technical', 'account', 'feature_request', 'other'], required: true },
        status:      { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
        priority:    { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
        assignedTo:  { type: Schema.Types.ObjectId, ref: 'User' },
        createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdByRole: { type: String, required: true },
        replies:     { type: [ReplySchema], default: [] },
        resolvedAt:  { type: Date },
        closedAt:    { type: Date },
    },
    { timestamps: true }
);

SaaSTicketSchema.pre('save', async function () {
    if (!this.ticketNo) {
        this.ticketNo = 'TKT-' + Date.now().toString(36).toUpperCase();
    }
});

SaaSTicketSchema.index({ tenantId: 1, createdAt: -1 });
SaaSTicketSchema.index({ status: 1, priority: 1 });

export default (mongoose.models.SaaSTicket as mongoose.Model<ISaaSTicket>) ||
    mongoose.model<ISaaSTicket>('SaaSTicket', SaaSTicketSchema);
