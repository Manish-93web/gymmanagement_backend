import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    permissions: string[];
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const RoleSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        permissions: [{ type: String }],
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Indexes
RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IRole>('Role', RoleSchema);
