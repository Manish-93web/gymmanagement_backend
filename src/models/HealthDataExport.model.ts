import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IHealthDataExport extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    shareToken: string;
    expiresAt: Date;
    sections: ('vitals' | 'bmi' | 'workouts' | 'nutrition' | 'assessments' | 'injuries' | 'supplements')[];
    recipientName?: string;
    recipientEmail?: string;
    recipientNote?: string;
    accessedAt?: Date;
    accessCount: number;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HealthDataExportSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        shareToken: {
            type: String,
            required: true,
            default: () => crypto.randomBytes(24).toString('hex'),
        },
        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        sections: [
            {
                type: String,
                enum: ['vitals', 'bmi', 'workouts', 'nutrition', 'assessments', 'injuries', 'supplements'],
            },
        ],
        recipientName: { type: String },
        recipientEmail: { type: String },
        recipientNote: { type: String },
        accessedAt: { type: Date },
        accessCount: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

HealthDataExportSchema.index({ shareToken: 1 }, { unique: true });
HealthDataExportSchema.index({ memberId: 1, expiresAt: 1 });
HealthDataExportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model<IHealthDataExport>('HealthDataExport', HealthDataExportSchema);
