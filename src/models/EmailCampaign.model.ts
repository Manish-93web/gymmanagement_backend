import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailCampaign extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    name: string;
    subject: string;
    content: string;
    templateId?: mongoose.Types.ObjectId;
    targetSegments: string[];
    scheduledFor?: Date;
    sentAt?: Date;
    completedAt?: Date;
    status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
    stats: {
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        openedCount: number;
        clickedCount: number;
        failedCount: number;
    };
    logs: {
        recipientId: mongoose.Types.ObjectId;
        status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed';
        timestamp: Date;
        error?: string;
    }[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const EmailCampaignSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        name: { type: String, required: true },
        subject: { type: String, required: true },
        content: { type: String, required: true },
        templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate' },
        targetSegments: [{ type: String }],
        scheduledFor: { type: Date },
        sentAt: { type: Date },
        completedAt: { type: Date },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'sending', 'completed', 'failed'],
            default: 'draft',
            index: true,
        },
        stats: {
            totalRecipients: { type: Number, default: 0 },
            sentCount: { type: Number, default: 0 },
            deliveredCount: { type: Number, default: 0 },
            openedCount: { type: Number, default: 0 },
            clickedCount: { type: Number, default: 0 },
            failedCount: { type: Number, default: 0 },
        },
        logs: [
            {
                recipientId: { type: Schema.Types.ObjectId, ref: 'Member' },
                status: {
                    type: String,
                    enum: ['sent', 'delivered', 'opened', 'clicked', 'failed'],
                },
                timestamp: { type: Date, default: Date.now },
                error: { type: String },
            },
        ],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

export default mongoose.model<IEmailCampaign>('EmailCampaign', EmailCampaignSchema);
