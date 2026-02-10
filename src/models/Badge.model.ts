import mongoose, { Schema, Document } from 'mongoose';

export interface IBadge extends Document {
    name: string;
    description: string;
    icon: string;
    category: 'attendance' | 'workout' | 'achievement' | 'social' | 'milestone';
    criteria: {
        type: 'attendance_count' | 'workout_count' | 'streak_days' | 'weight_lifted' | 'referrals' | 'transformation';
        value: number;
        period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
    };
    points: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
    tenantId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const BadgeSchema: Schema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    category: {
        type: String,
        enum: ['attendance', 'workout', 'achievement', 'social', 'milestone'],
        required: true
    },
    criteria: {
        type: {
            type: String,
            enum: ['attendance_count', 'workout_count', 'streak_days', 'weight_lifted', 'referrals', 'transformation'],
            required: true
        },
        value: { type: Number, required: true },
        period: { type: String, enum: ['daily', 'weekly', 'monthly', 'all_time'] },
    },
    points: { type: Number, default: 0 },
    tier: {
        type: String,
        enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
        default: 'bronze'
    },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
}, { timestamps: true });

export default mongoose.model<IBadge>('Badge', BadgeSchema);
