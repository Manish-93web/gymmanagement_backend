import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupMember extends Document {
    groupId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    role: 'admin' | 'moderator' | 'member';
    status: 'pending' | 'active' | 'blocked';
    joinedAt: Date;
    updatedAt: Date;
}

const GroupMemberSchema: Schema = new Schema(
    {
        groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        role: {
            type: String,
            enum: ['admin', 'moderator', 'member'],
            default: 'member',
        },
        status: {
            type: String,
            enum: ['pending', 'active', 'blocked'],
            default: 'active',
        },
        joinedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

GroupMemberSchema.index({ groupId: 1, memberId: 1 }, { unique: true });

export default mongoose.model<IGroupMember>('GroupMember', GroupMemberSchema);
