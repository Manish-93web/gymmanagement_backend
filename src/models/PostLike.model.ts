import mongoose, { Schema, Document } from 'mongoose';

export interface IPostLike extends Document {
    postId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const PostLikeSchema: Schema = new Schema({
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

PostLikeSchema.index({ postId: 1, memberId: 1 }, { unique: true });

export default mongoose.model<IPostLike>('PostLike', PostLikeSchema);
