import mongoose, { Schema, Document } from 'mongoose';

export interface IChallenge extends Document {
    name: string;
    description: string;
    type: 'attendance' | 'workout' | 'weight_loss' | 'steps' | 'custom';
    goal: {
        metric: string;
        target: number;
        unit: string;
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
        enum: ['attendance', 'workout', 'weight_loss', 'steps', 'custom'],
        required: true
    },
    goal: {
        metric: { type: String, required: true },
        target: { type: Number, required: true },
        unit: { type: String, required: true },
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
