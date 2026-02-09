import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    type: 'public' | 'private' | 'secret';
    category: 'fitness_goal' | 'workout_type' | 'social' | 'challenge' | 'other';
    coverImage?: string;
    rules: string[];
    maxMembers?: number;
    memberCount: number;
    postCount: number;
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const GroupSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, required: true },
        type: {
            type: String,
            enum: ['public', 'private', 'secret'],
            default: 'public',
        },
        category: {
            type: String,
            enum: ['fitness_goal', 'workout_type', 'social', 'challenge', 'other'],
            default: 'other',
        },
        coverImage: { type: String },
        rules: [{ type: String }],
        maxMembers: { type: Number },
        memberCount: { type: Number, default: 0 },
        postCount: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

GroupSchema.index({ tenantId: 1, category: 1 });
GroupSchema.index({ tenantId: 1, type: 1 });

export default mongoose.model<IGroup>('Group', GroupSchema);
