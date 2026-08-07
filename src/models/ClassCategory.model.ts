import mongoose, { Schema, Document } from 'mongoose';

// Persisted class category metadata (name/description/color) created via the
// "Add Category" flow. The class-listing/filter feature itself still derives
// its category list from the distinct `category` values on Class documents
// (see ClassService.getCategories) — this collection exists so a category can
// be pre-created (with its description/color) before any class references it.
export interface IClassCategory extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    color?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ClassCategorySchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String },
        color: { type: String },
    },
    { timestamps: true }
);

ClassCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IClassCategory>('ClassCategory', ClassCategorySchema);
