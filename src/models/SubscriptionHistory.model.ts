import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionHistory extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    subscriptionId: mongoose.Types.ObjectId;
    action: 'created' | 'renewed' | 'cancelled' | 'frozen' | 'unfrozen' | 'upgraded' | 'downgraded' | 'expired' | 'reactivated';
    previousPlanId?: mongoose.Types.ObjectId;
    newPlanId?: mongoose.Types.ObjectId;
    performedBy: mongoose.Types.ObjectId;
    notes?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}

const SubscriptionHistorySchema = new Schema<ISubscriptionHistory>({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
    action: {
        type: String,
        required: true,
        enum: ['created', 'renewed', 'cancelled', 'frozen', 'unfrozen', 'upgraded', 'downgraded', 'expired', 'reactivated']
    },
    previousPlanId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
    newPlanId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

SubscriptionHistorySchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });
SubscriptionHistorySchema.index({ subscriptionId: 1, createdAt: -1 });

export default mongoose.model<ISubscriptionHistory>('SubscriptionHistory', SubscriptionHistorySchema);
