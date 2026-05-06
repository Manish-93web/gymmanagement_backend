import mongoose, { Document, Schema } from 'mongoose';

export interface IFood extends Document {
    name: string;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    servingSize: number;
    servingUnit: string;
    barcode?: string;
    isCustom: boolean;
    tenantId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const FoodSchema = new Schema<IFood>({
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'general', enum: ['general', 'protein', 'carbs', 'fats', 'vegetables', 'fruits', 'dairy', 'grains', 'beverages', 'supplements'] },
    calories: { type: Number, required: true, min: 0 },
    protein: { type: Number, default: 0, min: 0 },
    carbs: { type: Number, default: 0, min: 0 },
    fat: { type: Number, default: 0, min: 0 },
    fiber: { type: Number, default: 0, min: 0 },
    sugar: { type: Number, default: 0, min: 0 },
    sodium: { type: Number, default: 0, min: 0 },
    servingSize: { type: Number, required: true, default: 100 },
    servingUnit: { type: String, default: 'g', enum: ['g', 'ml', 'oz', 'cup', 'tbsp', 'tsp', 'piece', 'serving'] },
    barcode: { type: String, sparse: true },
    isCustom: { type: Boolean, default: false },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

FoodSchema.index({ name: 'text', category: 1 });
FoodSchema.index({ tenantId: 1, isCustom: 1 });
FoodSchema.index({ barcode: 1 }, { sparse: true });

export default mongoose.model<IFood>('Food', FoodSchema);
