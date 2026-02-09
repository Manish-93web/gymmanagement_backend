import mongoose, { Schema, Document } from 'mongoose';

export interface IDietPlan extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    trainerId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    goal: 'weight_loss' | 'muscle_gain' | 'maintenance' | 'performance' | 'health';
    macros: {
        calories: number;
        protein: number;
        carbs: number;
        fats: number;
        fiber?: number;
    };
    meals: {
        name: string;
        time: string;
        foods: {
            foodName: string;
            quantity: number;
            unit: string;
            calories: number;
            protein: number;
            carbs: number;
            fats: number;
        }[];
        totalCalories: number;
        totalProtein: number;
        totalCarbs: number;
        totalFats: number;
    }[];
    schedule: {
        daysPerWeek: number;
        specificDays?: number[];
        duration: number; // weeks
    };
    restrictions: string[];
    preferences: string[];
    supplements?: {
        name: string;
        dosage: string;
        timing: string;
    }[];
    isActive: boolean;
    startDate: Date;
    endDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const DietPlanSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        trainerId: { type: Schema.Types.ObjectId, ref: 'Trainer' },
        name: { type: String, required: true },
        description: { type: String },
        goal: {
            type: String,
            enum: ['weight_loss', 'muscle_gain', 'maintenance', 'performance', 'health'],
            required: true,
        },
        macros: {
            calories: { type: Number, required: true },
            protein: { type: Number, required: true },
            carbs: { type: Number, required: true },
            fats: { type: Number, required: true },
            fiber: { type: Number },
        },
        meals: [
            {
                name: { type: String, required: true },
                time: { type: String, required: true },
                foods: [
                    {
                        foodName: { type: String, required: true },
                        quantity: { type: Number, required: true },
                        unit: { type: String, required: true },
                        calories: { type: Number, required: true },
                        protein: { type: Number, required: true },
                        carbs: { type: Number, required: true },
                        fats: { type: Number, required: true },
                    },
                ],
                totalCalories: { type: Number, required: true },
                totalProtein: { type: Number, required: true },
                totalCarbs: { type: Number, required: true },
                totalFats: { type: Number, required: true },
            },
        ],
        schedule: {
            daysPerWeek: { type: Number, required: true },
            specificDays: [{ type: Number, min: 0, max: 6 }],
            duration: { type: Number, required: true },
        },
        restrictions: [{ type: String }],
        preferences: [{ type: String }],
        supplements: [
            {
                name: { type: String, required: true },
                dosage: { type: String, required: true },
                timing: { type: String, required: true },
            },
        ],
        isActive: { type: Boolean, default: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
    },
    { timestamps: true }
);

// Indexes
DietPlanSchema.index({ tenantId: 1, memberId: 1, isActive: 1 });
DietPlanSchema.index({ trainerId: 1 });

export default mongoose.model<IDietPlan>('DietPlan', DietPlanSchema);
