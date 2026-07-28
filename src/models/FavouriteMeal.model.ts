import mongoose, { Schema, Document } from 'mongoose';

export interface IFavouriteMealItem {
    foodId?: string;
    foodName: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export interface IFavouriteMeal extends Document {
    tenantId: string;
    memberId: mongoose.Types.ObjectId;
    name: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
    items: IFavouriteMealItem[];
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    lastLoggedAt?: Date;
    logCount: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const FavouriteMealSchema = new Schema<IFavouriteMeal>(
    {
        tenantId: { type: String, required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
        name: { type: String, required: true, trim: true },
        mealType: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'],
            required: true,
        },
        items: [
            {
                foodId:   { type: String },
                foodName: { type: String, required: true },
                quantity: { type: Number, required: true },
                unit:     { type: String, required: true },
                calories: { type: Number, required: true, default: 0 },
                protein:  { type: Number, required: true, default: 0 },
                carbs:    { type: Number, required: true, default: 0 },
                fat:      { type: Number, required: true, default: 0 },
            },
        ],
        totalCalories: { type: Number, default: 0 },
        totalProtein:  { type: Number, default: 0 },
        totalCarbs:    { type: Number, default: 0 },
        totalFat:      { type: Number, default: 0 },
        lastLoggedAt:  { type: Date },
        logCount:      { type: Number, default: 0 },
        isActive:      { type: Boolean, default: true },
    },
    { timestamps: true }
);

FavouriteMealSchema.index({ tenantId: 1, memberId: 1 });
FavouriteMealSchema.index({ tenantId: 1, memberId: 1, mealType: 1 });

export default mongoose.model<IFavouriteMeal>('FavouriteMeal', FavouriteMealSchema);
