import mongoose, { Schema, Document } from 'mongoose';

export interface IExercise extends Document {
    tenantId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    category: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'sports' | 'other';
    muscleGroups: string[];
    equipment: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    instructions: string[];
    media: {
        type: 'image' | 'video' | 'gif';
        url: string;
        thumbnail?: string;
    }[];
    metrics: {
        type: 'reps' | 'time' | 'distance' | 'weight';
        unit: string;
    }[];
    isPublic: boolean;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ExerciseSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
        name: { type: String, required: true },
        description: { type: String },
        category: {
            type: String,
            enum: ['strength', 'cardio', 'flexibility', 'balance', 'sports', 'other'],
            required: true,
        },
        muscleGroups: [{ type: String }],
        equipment: [{ type: String }],
        difficulty: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced'],
            default: 'beginner',
        },
        instructions: [{ type: String }],
        media: [
            {
                type: { type: String, enum: ['image', 'video', 'gif'], required: true },
                url: { type: String, required: true },
                thumbnail: { type: String },
            },
        ],
        metrics: [
            {
                type: { type: String, enum: ['reps', 'time', 'distance', 'weight'], required: true },
                unit: { type: String, required: true },
            },
        ],
        isPublic: { type: Boolean, default: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Indexes
ExerciseSchema.index({ tenantId: 1, category: 1 });
ExerciseSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IExercise>('Exercise', ExerciseSchema);
