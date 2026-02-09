import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkoutLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    workoutId: mongoose.Types.ObjectId;
    date: Date;
    exercises: {
        exerciseId: mongoose.Types.ObjectId;
        sets: {
            setNumber: number;
            reps?: number;
            weight?: number;
            duration?: number;
            completed: boolean;
            notes?: string;
        }[];
        personalRecord?: {
            weight?: number;
            reps?: number;
            date: Date;
        };
        previousBest?: {
            weight?: number;
            reps?: number;
            date: Date;
        };
    }[];
    duration: number; // minutes
    caloriesBurned?: number;
    notes: string;
    rating?: number;
    createdAt: Date;
    updatedAt: Date;
}

const WorkoutLogSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        workoutId: { type: Schema.Types.ObjectId, ref: 'Workout', required: true },
        date: { type: Date, required: true, index: true },
        exercises: [
            {
                exerciseId: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
                sets: [
                    {
                        setNumber: { type: Number, required: true },
                        reps: { type: Number },
                        weight: { type: Number },
                        duration: { type: Number },
                        completed: { type: Boolean, default: true },
                        notes: { type: String },
                    },
                ],
                personalRecord: {
                    weight: { type: Number },
                    reps: { type: Number },
                    date: { type: Date },
                },
                previousBest: {
                    weight: { type: Number },
                    reps: { type: Number },
                    date: { type: Date },
                },
            },
        ],
        duration: { type: Number, required: true },
        caloriesBurned: { type: Number },
        notes: { type: String },
        rating: { type: Number, min: 1, max: 5 },
    },
    { timestamps: true }
);

// Indexes
WorkoutLogSchema.index({ tenantId: 1, memberId: 1, date: -1 });
WorkoutLogSchema.index({ workoutId: 1, date: -1 });

export default mongoose.model<IWorkoutLog>('WorkoutLog', WorkoutLogSchema);
