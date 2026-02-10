import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeParticipant extends Document {
    challengeId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    progress: number;
    pointsEarned?: number;
    completed: boolean;
    joinedAt: Date;
    updatedAt: Date;
}

const ChallengeParticipantSchema: Schema = new Schema({
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    progress: { type: Number, default: 0 },
    pointsEarned: { type: Number },
    completed: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ChallengeParticipantSchema.index({ challengeId: 1, memberId: 1 }, { unique: true });

export default mongoose.model<IChallengeParticipant>('ChallengeParticipant', ChallengeParticipantSchema);
