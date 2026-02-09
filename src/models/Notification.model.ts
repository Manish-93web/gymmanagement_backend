import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType = 'email' | 'sms' | 'whatsapp' | 'push';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

export interface INotification extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    recipientId: mongoose.Types.ObjectId;
    recipientType: 'member' | 'trainer' | 'staff' | 'lead';
    type: NotificationType;
    status: NotificationStatus;
    subject?: string;
    message: string;
    template?: string;
    variables?: any;
    metadata: {
        campaignId?: mongoose.Types.ObjectId;
        triggeredBy?: string;
        priority: 'low' | 'normal' | 'high' | 'urgent';
    };
    delivery: {
        sentAt?: Date;
        deliveredAt?: Date;
        openedAt?: Date;
        clickedAt?: Date;
        failedAt?: Date;
        errorMessage?: string;
        retryCount: number;
        maxRetries: number;
    };
    gateway?: {
        provider: string;
        messageId?: string;
        cost?: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        recipientId: { type: Schema.Types.ObjectId, required: true, index: true },
        recipientType: {
            type: String,
            enum: ['member', 'trainer', 'staff', 'lead'],
            required: true,
        },
        type: {
            type: String,
            enum: ['email', 'sms', 'whatsapp', 'push'],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
            default: 'pending',
            index: true,
        },
        subject: { type: String },
        message: { type: String, required: true },
        template: { type: String },
        variables: { type: Schema.Types.Mixed },
        metadata: {
            campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
            triggeredBy: { type: String },
            priority: {
                type: String,
                enum: ['low', 'normal', 'high', 'urgent'],
                default: 'normal',
            },
        },
        delivery: {
            sentAt: { type: Date },
            deliveredAt: { type: Date },
            openedAt: { type: Date },
            clickedAt: { type: Date },
            failedAt: { type: Date },
            errorMessage: { type: String },
            retryCount: { type: Number, default: 0 },
            maxRetries: { type: Number, default: 3 },
        },
        gateway: {
            provider: { type: String },
            messageId: { type: String },
            cost: { type: Number },
        },
    },
    { timestamps: true }
);

// Indexes
NotificationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, type: 1 });
NotificationSchema.index({ status: 1, 'delivery.retryCount': 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
