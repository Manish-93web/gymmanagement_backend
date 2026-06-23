import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
    content: string;
    type: 'text' | 'image' | 'video' | 'transformation' | 'achievement' | 'announcement';
    media?: string[];
    transformationData?: {
        beforeImage: string;
        afterImage: string;
        startDate: Date;
        endDate: Date;
        weightLost?: number;
        description: string;
    };
    visibility: 'public' | 'members' | 'group';
    groupId?: mongoose.Types.ObjectId;
    authorId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    createdAt: Date;
}

const PostSchema: Schema = new Schema({
    content: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'transformation', 'achievement', 'announcement'],
        default: 'text'
    },
    media: [{ type: String }],
    transformationData: {
        beforeImage: { type: String },
        afterImage: { type: String },
        startDate: { type: Date },
        endDate: { type: Date },
        weightLost: { type: Number },
        description: { type: String }
    },
    visibility: {
        type: String,
        enum: ['public', 'members', 'group'],
        default: 'members'
    },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
}, { timestamps: true });

PostSchema.index({ tenantId: 1, createdAt: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });

export default mongoose.model<IPost>('Post', PostSchema);
