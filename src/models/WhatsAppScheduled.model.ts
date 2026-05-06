import mongoose, { Document, Schema } from 'mongoose';

export interface IWhatsAppScheduled extends Document {
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    recipient: string;
    message: string;
    templateName?: string;
    mediaUrl?: string;
    scheduledAt: Date;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    sentAt?: Date;
    failureReason?: string;
    jobId?: string;
    recipientType: 'single' | 'group' | 'segment';
    segment?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppScheduledSchema = new Schema<IWhatsAppScheduled>({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: String, required: true },
    message: { type: String, required: true },
    templateName: { type: String },
    mediaUrl: { type: String },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' },
    sentAt: { type: Date },
    failureReason: { type: String },
    jobId: { type: String },
    recipientType: { type: String, enum: ['single', 'group', 'segment'], default: 'single' },
    segment: { type: String },
}, { timestamps: true });

WhatsAppScheduledSchema.index({ tenantId: 1, status: 1, scheduledAt: 1 });
WhatsAppScheduledSchema.index({ jobId: 1 }, { sparse: true });

export default mongoose.model<IWhatsAppScheduled>('WhatsAppScheduled', WhatsAppScheduledSchema);
