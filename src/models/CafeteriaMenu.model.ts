import mongoose, { Document, Schema } from 'mongoose';

// ─── Cafeteria Menu Item ──────────────────────────────────────────────────────
export interface ICafeteriaItem extends Document {
  tenantId: string;
  name: string;
  description?: string;
  category: 'breakfast' | 'lunch' | 'snacks' | 'beverages' | 'dinner' | 'special';
  price: number;
  mrp?: number;
  costPrice?: number;
  calories?: number;
  isVeg: boolean;
  isAvailable: boolean;
  isDailySpecial: boolean;
  image?: string;
  preparationTime?: number;
  allergens?: string[];
  hsnCode?: string;
  gstRate?: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const CafeteriaItemSchema: Schema = new Schema(
  {
    tenantId:        { type: String, required: true, index: true },
    name:            { type: String, required: true, trim: true },
    description:     { type: String },
    category:        {
      type: String,
      enum: ['breakfast', 'lunch', 'snacks', 'beverages', 'dinner', 'special'],
      required: true,
    },
    price:           { type: Number, required: true, min: 0 },
    mrp:             { type: Number, min: 0 },
    costPrice:       { type: Number, min: 0 },
    calories:        { type: Number, min: 0 },
    isVeg:           { type: Boolean, default: true },
    isAvailable:     { type: Boolean, default: true },
    isDailySpecial:  { type: Boolean, default: false },
    image:           { type: String },
    preparationTime: { type: Number, min: 0 },
    allergens:       [{ type: String }],
    hsnCode:         { type: String, default: '2106' },
    gstRate:         { type: Number, default: 5 },
    sortOrder:       { type: Number, default: 0 },
  },
  { timestamps: true },
);

CafeteriaItemSchema.index({ tenantId: 1, category: 1 });
CafeteriaItemSchema.index({ tenantId: 1, isDailySpecial: 1 });

export const CafeteriaItem = mongoose.model<ICafeteriaItem>('CafeteriaItem', CafeteriaItemSchema);

// ─── Cafeteria Order ──────────────────────────────────────────────────────────
export interface ICafeteriaOrder extends Document {
  tenantId: string;
  orderNumber: string;
  tableNumber?: string;
  memberId?: string;
  memberName?: string;
  staffId: string;
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isVeg: boolean;
  }>;
  subtotal: number;
  gstAmount: number;
  discount: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'wallet' | 'credit';
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema(
  {
    itemId:     { type: String, required: true },
    itemName:   { type: String, required: true },
    quantity:   { type: Number, required: true, min: 1 },
    unitPrice:  { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    isVeg:      { type: Boolean, default: true },
  },
  { _id: false },
);

const CafeteriaOrderSchema: Schema = new Schema(
  {
    tenantId:      { type: String, required: true, index: true },
    orderNumber:   { type: String, unique: true },
    tableNumber:   { type: String },
    memberId:      { type: String },
    memberName:    { type: String },
    staffId:       { type: String, required: true },
    items:         { type: [OrderItemSchema], default: [] },
    subtotal:      { type: Number, required: true, min: 0 },
    gstAmount:     { type: Number, default: 0, min: 0 },
    discount:      { type: Number, default: 0, min: 0 },
    totalAmount:   { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'upi', 'card', 'wallet', 'credit'],
      default: 'cash',
    },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'ready', 'served', 'cancelled'],
      default: 'pending',
    },
    notes: { type: String },
  },
  { timestamps: true },
);

// Auto-generate order number before save
CafeteriaOrderSchema.pre('save', async function (next) {
  if (!this.isNew) return next();
  try {
    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const count = await CafeteriaOrder.countDocuments({ tenantId: this.tenantId });
    this.orderNumber = `CAF-${yyyymmdd}-${String(count + 1).padStart(3, '0')}`;
    next();
  } catch (err: any) {
    next(err);
  }
});

CafeteriaOrderSchema.index({ tenantId: 1, createdAt: -1 });
CafeteriaOrderSchema.index({ tenantId: 1, status: 1 });

export const CafeteriaOrder = mongoose.model<ICafeteriaOrder>('CafeteriaOrder', CafeteriaOrderSchema);
