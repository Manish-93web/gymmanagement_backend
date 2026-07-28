import mongoose, { Document, Schema } from 'mongoose';

export interface IMarketplaceProduct extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  category: 'supplements' | 'apparel' | 'equipment' | 'accessories' | 'nutrition' | 'wellness' | 'merchandise' | 'other';
  brand?: string;
  sku?: string;
  imageUrl?: string;
  images: string[];
  price: number;
  memberPrice?: number; // discounted price for members
  compareAtPrice?: number; // original price shown crossed out
  stock: number;
  isInfiniteStock: boolean;
  unit: string; // '500g', 'pair', 'piece', etc.
  variants?: { name: string; options: string[] }[]; // e.g. Flavor: Chocolate, Vanilla
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  viewCount: number;
  orderCount: number;
  rating?: number;
  reviewCount: number;
  createdBy: mongoose.Types.ObjectId;
}

const MarketplaceProductSchema = new Schema<IMarketplaceProduct>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    name:        { type: String, required: true, trim: true },
    description: String,
    category:    { type: String, enum: ['supplements', 'apparel', 'equipment', 'accessories', 'nutrition', 'wellness', 'merchandise', 'other'], required: true },
    brand:       String,
    sku:         String,
    imageUrl:    String,
    images:      { type: [String], default: [] },
    price:       { type: Number, required: true, min: 0 },
    memberPrice: Number,
    compareAtPrice: Number,
    stock:       { type: Number, default: 0 },
    isInfiniteStock: { type: Boolean, default: false },
    unit:        { type: String, default: 'piece' },
    variants:    [{
      name:    String,
      options: [String],
    }],
    tags:        { type: [String], default: [] },
    isActive:    { type: Boolean, default: true },
    isFeatured:  { type: Boolean, default: false },
    sortOrder:   { type: Number, default: 0 },
    viewCount:   { type: Number, default: 0 },
    orderCount:  { type: Number, default: 0 },
    rating:      { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

MarketplaceProductSchema.index({ tenantId: 1, isActive: 1, category: 1 });
MarketplaceProductSchema.index({ tenantId: 1, isFeatured: 1 });
MarketplaceProductSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });

export default mongoose.model<IMarketplaceProduct>('MarketplaceProduct', MarketplaceProductSchema);
