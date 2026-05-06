import mongoose, { Schema, Document } from 'mongoose';

export interface INutritionLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    date: Date;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
    foods: {
        foodName: string;
        quantity: number;
        unit: string;
        calories: number;
        protein: number;
        carbs: number;
        fats: number;
        fiber?: number;
    }[];
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFats: number;
    totalFiber: number;
    notes?: string;
    waterIntake?: number; // ml
    createdAt: Date;
    updatedAt: Date;
}

const NutritionLogSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: Date, required: true, index: true },
        mealType: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'],
            required: true,
        },
        foods: [
            {
                foodName: { type: String, required: true },
                quantity: { type: Number, required: true },
                unit: { type: String, required: true },
                calories: { type: Number, required: true, default: 0 },
                protein: { type: Number, required: true, default: 0 },
                carbs: { type: Number, required: true, default: 0 },
                fats: { type: Number, required: true, default: 0 },
                fiber: { type: Number, default: 0 },
            },
        ],
        totalCalories: { type: Number, default: 0 },
        totalProtein: { type: Number, default: 0 },
        totalCarbs: { type: Number, default: 0 },
        totalFats: { type: Number, default: 0 },
        totalFiber: { type: Number, default: 0 },
        notes: { type: String },
        waterIntake: { type: Number, default: 0 },
    },
    { timestamps: true }
);

NutritionLogSchema.index({ tenantId: 1, memberId: 1, date: -1 });

export default mongoose.model<INutritionLog>('NutritionLog', NutritionLogSchema);
