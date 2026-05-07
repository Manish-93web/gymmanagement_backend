import mongoose, { Schema, Document } from 'mongoose';

export type UsageRecordType = 'members' | 'sms' | 'whatsapp' | 'ai_credits' | 'branches' | 'storage';

export interface IUsageRecord extends Document {
    tenantId: mongoose.Types.ObjectId;
    type: UsageRecordType;
    currentValue: number;
    limit: number;
    period: 'monthly' | 'lifetime';
    lastResetAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UsageRecordSchema = new Schema<IUsageRecord>(
    {
        tenantId:     { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        type:         { type: String, enum: ['members', 'sms', 'whatsapp', 'ai_credits', 'branches', 'storage'], required: true },
        currentValue: { type: Number, default: 0, min: 0 },
        limit:        { type: Number, required: true, min: -1 }, // -1 = unlimited
        period:       { type: String, enum: ['monthly', 'lifetime'], default: 'monthly' },
        lastResetAt:  { type: Date },
    },
    { timestamps: true }
);

UsageRecordSchema.index({ tenantId: 1, type: 1 }, { unique: true });

export default (mongoose.models.UsageRecord as mongoose.Model<IUsageRecord>) ||
    mongoose.model<IUsageRecord>('UsageRecord', UsageRecordSchema);
