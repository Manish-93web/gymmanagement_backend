import mongoose, { Schema, Document } from 'mongoose';

export type SaaSAlertType =
    | 'trial_ending_3d'
    | 'trial_ending_1d'
    | 'trial_expired'
    | 'renewal_due_7d'
    | 'renewal_due_1d'
    | 'payment_received'
    | 'plan_changed'
    | 'account_suspended'
    | 'account_reactivated'
    | 'trial_extended'
    | 'high_churn_risk'
    | 'payment_overdue';

export type SaaSAlertAudience = 'gym_owner' | 'super_admin' | 'finance_admin';

export interface ISaaSAlert extends Document {
    tenantId: mongoose.Types.ObjectId;
    gymName: string;
    type: SaaSAlertType;
    audience: SaaSAlertAudience;
    title: string;
    message: string;
    isRead: boolean;
    readAt?: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
}

const SaaSAlertSchema = new Schema<ISaaSAlert>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        gymName:  { type: String, default: '' },
        type:     { type: String, required: true },
        audience: { type: String, required: true, index: true },
        title:    { type: String, required: true },
        message:  { type: String, required: true },
        isRead:   { type: Boolean, default: false, index: true },
        readAt:   { type: Date },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

SaaSAlertSchema.index({ tenantId: 1, createdAt: -1 });
SaaSAlertSchema.index({ audience: 1, isRead: 1, createdAt: -1 });

export default (mongoose.models.SaaSAlert as mongoose.Model<ISaaSAlert>) ||
    mongoose.model<ISaaSAlert>('SaaSAlert', SaaSAlertSchema);
