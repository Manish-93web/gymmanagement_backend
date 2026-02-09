import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    category: 'supplement' | 'apparel' | 'equipment' | 'accessory' | 'other';
    sku: string;
    barcode?: string;
    pricing: {
        cost: number;
        sellingPrice: number;
        memberPrice?: number;
        taxRate: number;
    };
    inventory: {
        currentStock: number;
        minStock: number;
        maxStock: number;
        reorderPoint: number;
        unit: string;
    };
    vendor?: {
        name: string;
        contact: string;
        email: string;
    };
    isActive: boolean;
    images: string[];
    createdAt: Date;
    updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        category: {
            type: String,
            enum: ['supplement', 'apparel', 'equipment', 'accessory', 'other'],
            required: true,
        },
        sku: { type: String, required: true, unique: true },
        barcode: { type: String, unique: true, sparse: true },
        pricing: {
            cost: { type: Number, required: true },
            sellingPrice: { type: Number, required: true },
            memberPrice: { type: Number },
            taxRate: { type: Number, default: 0 },
        },
        inventory: {
            currentStock: { type: Number, required: true, default: 0 },
            minStock: { type: Number, default: 0 },
            maxStock: { type: Number },
            reorderPoint: { type: Number, default: 10 },
            unit: { type: String, required: true, default: 'piece' },
        },
        vendor: {
            name: { type: String },
            contact: { type: String },
            email: { type: String },
        },
        isActive: { type: Boolean, default: true },
        images: [{ type: String }],
    },
    { timestamps: true }
);

// Indexes
ProductSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });
ProductSchema.index({ sku: 1 });
ProductSchema.index({ barcode: 1 });
ProductSchema.index({ 'inventory.currentStock': 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
