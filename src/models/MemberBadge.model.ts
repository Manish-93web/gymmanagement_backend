import mongoose, { Schema, Document } from 'mongoose';

export interface IMemberBadge extends Document {
    memberId: mongoose.Types.ObjectId;
    badgeId: mongoose.Types.ObjectId;
    earnedAt: Date;
    points: number;
}

const MemberBadgeSchema: Schema = new Schema({
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    badgeId: { type: Schema.Types.ObjectId, ref: 'Badge', required: true, index: true },
    earnedAt: { type: Date, default: Date.now },
    points: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });

MemberBadgeSchema.index({ memberId: 1, badgeId: 1 }, { unique: true });

export default mongoose.model<IMemberBadge>('MemberBadge', MemberBadgeSchema);
