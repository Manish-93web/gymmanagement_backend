import mongoose, { Schema, Document } from 'mongoose';

export type WATemplateType =
    | 'welcome'
    | 'trial_ending'
    | 'trial_expired'
    | 'upgrade_offer'
    | 'plan_activated'
    | 'renewal_reminder'
    | 'payment_reminder'
    | 'payment_received'
    | 'feature_announcement'
    | 'support_followup'
    | 'discount_offer'
    | 'festival_offer'
    | 'custom';

export interface IAdminWhatsAppLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    gymName: string;
    ownerName: string;
    phone: string;
    templateType: WATemplateType;
    message: string;
    sentBy: string;
    sentByRole: string;
    sentAt: Date;
    openedAt?: Date;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    deepLink: string;
    variables?: Record<string, string>;
}

const AdminWhatsAppLogSchema = new Schema<IAdminWhatsAppLog>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        gymName:  { type: String, required: true },
        ownerName: { type: String, required: true },
        phone:    { type: String, required: true },
        templateType: {
            type: String,
            enum: ['welcome', 'trial_ending', 'trial_expired', 'upgrade_offer', 'plan_activated',
                'renewal_reminder', 'payment_reminder', 'payment_received', 'feature_announcement',
                'support_followup', 'discount_offer', 'festival_offer', 'custom'],
            required: true,
        },
        message:    { type: String, required: true },
        sentBy:     { type: String, required: true },
        sentByRole: { type: String, default: 'super_admin' },
        sentAt:     { type: Date, default: Date.now },
        openedAt:   { type: Date },
        status:     { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
        deepLink:   { type: String, required: true },
        variables:  { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

AdminWhatsAppLogSchema.index({ tenantId: 1, sentAt: -1 });
AdminWhatsAppLogSchema.index({ sentAt: -1 });

export default (mongoose.models.AdminWhatsAppLog as mongoose.Model<IAdminWhatsAppLog>) ||
    mongoose.model<IAdminWhatsAppLog>('AdminWhatsAppLog', AdminWhatsAppLogSchema);
