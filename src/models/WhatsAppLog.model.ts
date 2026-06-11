import mongoose, { Schema, Document } from 'mongoose';

export type WALogTemplateType =
    | 'welcome'
    | 'renewal_reminder'
    | 'payment_receipt'
    | 'invoice'
    | 'birthday_wish'
    | 'festival_offer'
    | 'pending_payment'
    | 'expiry_today'
    | 'freeze_confirmation'
    | 'comeback_offer'
    | 'refer_earn'
    | 'pt_reminder'
    | 'class_reminder'
    | 'custom_message'
    | 'inquiry_followup';

export type LogStatus = 'opened' | 'copied' | 'cancelled' | 'failed';
export type LogDeviceType = 'mobile' | 'desktop' | 'unknown';

export interface IWhatsAppLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    memberName: string;
    phone: string;
    type: WALogTemplateType;
    templateId?: string;
    message: string;
    sentAt: Date;
    openedAt?: Date;
    sentBy: mongoose.Types.ObjectId;
    sentByName: string;
    status: LogStatus;
    deviceType: LogDeviceType;
    language?: string;
    notes?: string;
}

const ALL_TEMPLATE_TYPES: WALogTemplateType[] = [
    'welcome', 'renewal_reminder', 'payment_receipt', 'invoice', 'birthday_wish',
    'festival_offer', 'pending_payment', 'expiry_today', 'freeze_confirmation',
    'comeback_offer', 'refer_earn', 'pt_reminder', 'class_reminder', 'custom_message', 'inquiry_followup',
];

const WhatsAppLogSchema = new Schema<IWhatsAppLog>(
    {
        tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId:   { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        memberName: { type: String, required: true, trim: true },
        phone:      { type: String, required: true, trim: true },
        type:       { type: String, enum: ALL_TEMPLATE_TYPES, required: true },
        templateId: { type: String },
        message:    { type: String, required: true },
        sentAt:     { type: Date, default: Date.now, index: true },
        openedAt:   { type: Date },
        sentBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
        sentByName: { type: String, default: '' },
        status:     { type: String, enum: ['opened', 'copied', 'cancelled', 'failed'], default: 'opened' },
        deviceType: { type: String, enum: ['mobile', 'desktop', 'unknown'], default: 'unknown' },
        language:   { type: String, default: 'en' },
        notes:      { type: String, default: '' },
    },
    { timestamps: true }
);

WhatsAppLogSchema.index({ tenantId: 1, sentAt: -1 });
WhatsAppLogSchema.index({ tenantId: 1, type: 1 });
WhatsAppLogSchema.index({ tenantId: 1, memberId: 1, sentAt: -1 });

export default (mongoose.models.WhatsAppLog as mongoose.Model<IWhatsAppLog>) ||
    mongoose.model<IWhatsAppLog>('WhatsAppLog', WhatsAppLogSchema);
