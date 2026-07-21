import mongoose, { Schema, Document } from 'mongoose';

export interface ICRMIntegration extends Document {
    tenantId: mongoose.Types.ObjectId;
    platform: 'facebook' | 'instagram';
    verifyToken?: string;
    accessToken?: string;
    pageId?: string;
    connected: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CRMIntegrationSchema = new Schema<ICRMIntegration>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        platform: { type: String, enum: ['facebook', 'instagram'], required: true },
        verifyToken: { type: String },
        accessToken: { type: String },
        pageId: { type: String },
        connected: { type: Boolean, default: false },
    },
    { timestamps: true }
);

CRMIntegrationSchema.index({ tenantId: 1, platform: 1 }, { unique: true });

export default mongoose.model<ICRMIntegration>('CRMIntegration', CRMIntegrationSchema);
