import mongoose, { Schema, Document } from 'mongoose';

export interface IWinbackCampaign extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    type: 'email' | 'sms' | 'whatsapp' | 'multi_channel';
    targetLevel: 'warning' | 'critical' | 'churned' | 'all';
    subject?: string;
    message: string;
    offerType?: 'discount' | 'free_session' | 'upgrade' | 'none';
    offerValue?: number;
    offerExpiry?: Date;
    status: 'draft' | 'sending' | 'sent' | 'cancelled';
    recipientCount: number;
    sentCount: number;
    openedCount: number;
    convertedCount: number;
    sentAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WinbackCampaignSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        type: {
            type: String,
            enum: ['email', 'sms', 'whatsapp', 'multi_channel'],
            required: true,
        },
        targetLevel: {
            type: String,
            enum: ['warning', 'critical', 'churned', 'all'],
            required: true,
        },
        subject: { type: String },
        message: { type: String, required: true },
        offerType: {
            type: String,
            enum: ['discount', 'free_session', 'upgrade', 'none'],
        },
        offerValue: { type: Number },
        offerExpiry: { type: Date },
        status: {
            type: String,
            enum: ['draft', 'sending', 'sent', 'cancelled'],
            default: 'draft',
        },
        recipientCount: { type: Number, default: 0 },
        sentCount: { type: Number, default: 0 },
        openedCount: { type: Number, default: 0 },
        convertedCount: { type: Number, default: 0 },
        sentAt: { type: Date },
    },
    { timestamps: true }
);

export default mongoose.model<IWinbackCampaign>('WinbackCampaign', WinbackCampaignSchema);
