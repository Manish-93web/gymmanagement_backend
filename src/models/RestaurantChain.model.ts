import mongoose, { Schema, Document } from 'mongoose';

export interface IMenuItem {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    servingSize: string;
    isHealthy: boolean;
    tags: string[];
}

export interface IRestaurantChain extends Document {
    name: string;
    cuisine: string;
    logoEmoji?: string;
    isIndianChain: boolean;
    menuItems: IMenuItem[];
    healthyOptions: string[];
    avoidItems: string[];
    generalTip: string;
    createdAt: Date;
    updatedAt: Date;
}

const MenuItemSchema = new Schema(
    {
        name: { type: String, required: true },
        calories: { type: Number, required: true, default: 0 },
        protein: { type: Number, required: true, default: 0 },
        carbs: { type: Number, required: true, default: 0 },
        fat: { type: Number, required: true, default: 0 },
        servingSize: { type: String, required: true },
        isHealthy: { type: Boolean, default: false },
        tags: [{ type: String }],
    },
    { _id: false }
);

const RestaurantChainSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        cuisine: { type: String, required: true },
        logoEmoji: { type: String },
        isIndianChain: { type: Boolean, default: false },
        menuItems: [MenuItemSchema],
        healthyOptions: [{ type: String }],
        avoidItems: [{ type: String }],
        generalTip: { type: String, default: '' },
    },
    { timestamps: true }
);

RestaurantChainSchema.index({ name: 1 });
RestaurantChainSchema.index({ cuisine: 1 });
RestaurantChainSchema.index({ isIndianChain: 1 });

export default mongoose.model<IRestaurantChain>('RestaurantChain', RestaurantChainSchema);
