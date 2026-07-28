import mongoose, { Schema, Document } from 'mongoose';

export interface IChallenge extends Document {
    name: string;
    description: string;
    type: 'attendance' | 'workout' | 'weight_loss' | 'steps' | 'custom' | 'progressive_678' | 'monthly_habit';
    goal: {
        metric: string;
        target: number;
        unit: string;
    };
    // GAP 48: Monthly Micro-Challenge configuration (used when type === 'monthly_habit')
    microChallengeConfig?: {
        habitType: 'water_intake' | 'steps' | 'sleep' | 'meditation' | 'protein' | 'workout_minutes' | 'custom';
        dailyTarget: number;        // e.g. 2.0 for 2L water, 8000 for steps
        unit: string;               // 'liters', 'steps', 'minutes', 'grams', etc.
        durationDays: 7 | 14 | 21 | 30;
        successDayTarget?: number;  // days needed to pass (default = durationDays)
        reminderTime?: string;      // '08:00' — push notification time
        badge?: string;             // badge slug awarded on completion
        customHabitName?: string;   // used when habitType = 'custom'
    };
    startDate: Date;
    endDate: Date;
    status: 'upcoming' | 'active' | 'completed' | 'cancelled';
    rewards: {
        winner: number;
        topThree: number;
        participants: number;
    };
    maxParticipants?: number;
    participantCount: number;
    progressiveSchedule?: {
        monthlyTargets: number[];
        currentMonth: number;
    };
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    completedAt?: Date;
    createdAt: Date;
}

const ChallengeSchema: Schema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: {
        type: String,
        enum: ['attendance', 'workout', 'weight_loss', 'steps', 'custom', 'progressive_678', 'monthly_habit'],
        required: true
    },
    microChallengeConfig: {
        habitType:       { type: String, enum: ['water_intake', 'steps', 'sleep', 'meditation', 'protein', 'workout_minutes', 'custom'] },
        dailyTarget:     { type: Number },
        unit:            { type: String },
        durationDays:    { type: Number, enum: [7, 14, 21, 30], default: 30 },
        successDayTarget:{ type: Number },
        reminderTime:    { type: String },
        badge:           { type: String },
        customHabitName: { type: String },
    },
    goal: {
        metric: { type: String, required: true },
        target: { type: Number, required: true },
        unit: { type: String, required: true },
    },
    progressiveSchedule: {
        monthlyTargets: { type: [Number], default: undefined },
        currentMonth: { type: Number, default: 1 },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
        type: String,
        enum: ['upcoming', 'active', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    rewards: {
        winner: { type: Number, default: 0 },
        topThree: { type: Number, default: 0 },
        participants: { type: Number, default: 0 },
    },
    maxParticipants: { type: Number },
    participantCount: { type: Number, default: 0 },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    completedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model<IChallenge>('Challenge', ChallengeSchema);
