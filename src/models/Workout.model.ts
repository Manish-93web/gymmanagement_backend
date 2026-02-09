import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkout extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    trainerId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    goal: string;
    exercises: {
        exerciseId: mongoose.Types.ObjectId;
        order: number;
        sets: number;
        reps?: number;
        duration?: number; // seconds
        weight?: number;
        restTime: number; // seconds
        notes?: string;
        progressionRule?: {
            type: 'linear' | 'percentage' | 'custom';
            increment: number;
            frequency: number; // weeks
        };
    }[];
    schedule: {
        daysPerWeek: number;
        specificDays?: number[]; // 0-6
        duration: number; // weeks
    };
    isActive: boolean;
    startDate: Date;
    endDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WorkoutSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        trainerId: { type: Schema.Types.ObjectId, ref: 'Trainer' },
        name: { type: String, required: true },
        description: { type: String },
        goal: { type: String },
        exercises: [
            {
                exerciseId: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
                order: { type: Number, required: true },
                sets: { type: Number, required: true },
                reps: { type: Number },
                duration: { type: Number },
                weight: { type: Number },
                restTime: { type: Number, default: 60 },
                notes: { type: String },
                progressionRule: {
                    type: { type: String, enum: ['linear', 'percentage', 'custom'] },
                    increment: { type: Number },
                    frequency: { type: Number },
                },
            },
        ],
        schedule: {
            daysPerWeek: { type: Number, required: true },
            specificDays: [{ type: Number, min: 0, max: 6 }],
            duration: { type: Number, required: true },
        },
        isActive: { type: Boolean, default: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
    },
    { timestamps: true }
);

// Indexes
WorkoutSchema.index({ tenantId: 1, memberId: 1, isActive: 1 });
WorkoutSchema.index({ trainerId: 1 });

export default mongoose.model<IWorkout>('Workout', WorkoutSchema);
