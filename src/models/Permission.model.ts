import mongoose, { Schema, Document } from 'mongoose';

export interface IPermission extends Document {
    name: string;
    description: string;
    category: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PermissionSchema: Schema = new Schema(
    {
        name: { type: String, required: true, unique: true },
        description: { type: String, required: true },
        category: { type: String, required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.model<IPermission>('Permission', PermissionSchema);
