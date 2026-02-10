import mongoose, { Schema, Document } from 'mongoose';

export interface IPlugin extends Document {
    name: string;
    identifier: string; // e.g. 'com.gym.whatsapp'
    version: string;
    description: string;
    isEnabled: boolean;
    tenantId: mongoose.Types.ObjectId;
    config: any;
    hooks: string[]; // ['onMemberCheckin', 'onPaymentComplete']
    createdAt: Date;
    updatedAt: Date;
}

const PluginSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        identifier: { type: String, required: true, unique: true },
        version: { type: String, required: true },
        description: { type: String },
        isEnabled: { type: Boolean, default: false },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        config: { type: Object, default: {} },
        hooks: [{ type: String }],
    },
    { timestamps: true }
);

// Compound index for tenant-specific plugins
PluginSchema.index({ tenantId: 1, identifier: 1 }, { unique: true });

export default mongoose.model<IPlugin>('Plugin', PluginSchema);
