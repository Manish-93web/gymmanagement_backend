import mongoose, { Schema, Document } from 'mongoose';

export interface ISMSTemplate extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    content: string;
    variables: string[];
    category: 'auth' | 'billing' | 'marketing' | 'notification';
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SMSTemplateSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        content: { type: String, required: true },
        variables: [{ type: String }],
        category: {
            type: String,
            enum: ['auth', 'billing', 'marketing', 'notification'],
            default: 'notification',
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Indexes
SMSTemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<ISMSTemplate>('SMSTemplate', SMSTemplateSchema);
