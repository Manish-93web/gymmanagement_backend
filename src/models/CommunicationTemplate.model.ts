import mongoose, { Schema, Document } from 'mongoose';

export type TemplateType = 'email' | 'sms' | 'whatsapp';

export interface ICommunicationTemplate extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    type: TemplateType;
    subject?: string; // For email templates
    content: string; // Message body with placeholders like {firstName}
    variables: string[]; // List of supported placeholders
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CommunicationTemplateSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        type: {
            type: String,
            enum: ['email', 'sms', 'whatsapp'],
            required: true,
            index: true
        },
        subject: { type: String },
        content: { type: String, required: true },
        variables: [{ type: String }],
        isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

// Indexes
CommunicationTemplateSchema.index({ tenantId: 1, type: 1 });
CommunicationTemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<ICommunicationTemplate>('CommunicationTemplate', CommunicationTemplateSchema);
