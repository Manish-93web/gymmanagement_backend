import mongoose, { Schema, Document } from 'mongoose';

export interface IPostComment extends Document {
    postId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    content: string;
    likeCount: number;
    createdAt: Date;
}

const PostCommentSchema: Schema = new Schema({
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    content: { type: String, required: true },
    likeCount: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: true } });

export default mongoose.model<IPostComment>('PostComment', PostCommentSchema);
