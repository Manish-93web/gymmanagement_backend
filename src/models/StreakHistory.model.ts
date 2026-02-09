import mongoose, { Schema, Document } from 'mongoose';

export interface IStreakHistory extends Document {
    memberId: mongoose.Types.ObjectId;
    streakType: 'attendance' | 'workout';
    streakDays: number;
    startDate: Date;
    endDate: Date;
    createdAt: Date;
}

const StreakHistorySchema: Schema = new Schema(
    {
        memberId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        streakType: {
            type: String,
            enum: ['attendance', 'workout'],
            default: 'attendance',
        },
        streakDays: { type: Number, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
    },
    { timestamps: true }
);

StreakHistorySchema.index({ memberId: 1, streakType: 1, endDate: -1 });

export default mongoose.model<IStreakHistory>('StreakHistory', StreakHistorySchema);
