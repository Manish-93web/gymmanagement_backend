import mongoose, { Schema, Document } from 'mongoose';

export interface IWinbackRecipient extends Document {
    campaignId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'converted' | 'failed';
    sentAt: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    convertedAt?: Date;
    error?: string;
}

const WinbackRecipientSchema: Schema = new Schema(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: 'WinbackCampaign', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        status: {
            type: String,
            enum: ['sent', 'delivered', 'opened', 'clicked', 'converted', 'failed'],
            default: 'sent',
        },
        sentAt: { type: Date, default: Date.now },
        deliveredAt: { type: Date },
        openedAt: { type: Date },
        clickedAt: { type: Date },
        convertedAt: { type: Date },
        error: { type: String },
    },
    { timestamps: true }
);

WinbackRecipientSchema.index({ campaignId: 1, status: 1 });
WinbackRecipientSchema.index({ memberId: 1, campaignId: 1 }, { unique: true });

export default mongoose.model<IWinbackRecipient>('WinbackRecipient', WinbackRecipientSchema);
