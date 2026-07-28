import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeParticipant extends Document {
    challengeId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    progress: number;
    status: 'active' | 'completed' | 'dropped';
    joinedAt: Date;
    completedAt?: Date;
    // GAP 48: daily habit logs for monthly_habit type challenges
    dailyLogs?: {
        date: Date;
        value: number;       // actual logged value (e.g. 2.1 litres, 8234 steps)
        achieved: boolean;   // value >= dailyTarget
    }[];
    daysAchieved?: number;   // count of days where achieved = true
}

const schema = new Schema({
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'dropped'], default: 'active' },
    joinedAt: { type: Date, default: Date.now },
    completedAt: Date,
    dailyLogs: [{
        date:     { type: Date, required: true },
        value:    { type: Number, required: true },
        achieved: { type: Boolean, required: true },
    }],
    daysAchieved: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ challengeId: 1, memberId: 1 }, { unique: true });

export default mongoose.model<IChallengeParticipant>('ChallengeParticipant', schema);
