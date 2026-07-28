import mongoose, { Document, Schema } from 'mongoose';

export interface IMarketplaceOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  memberName: string;
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'processing' | 'ready_for_pickup' | 'delivered' | 'cancelled';
  items: {
    productId: mongoose.Types.ObjectId;
    name: string;
    imageUrl?: string;
    price: number;
    quantity: number;
    variant?: string;
    subtotal: number;
  }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'upi' | 'wallet' | 'card' | 'pending';
  paymentStatus: 'pending' | 'paid' | 'refunded';
  notes?: string;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
}

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'MarketplaceProduct', required: true },
  name:      { type: String, required: true },
  imageUrl:  String,
  price:     { type: Number, required: true },
  quantity:  { type: Number, required: true, min: 1 },
  variant:   String,
  subtotal:  { type: Number, required: true },
}, { _id: false });

const MarketplaceOrderSchema = new Schema<IMarketplaceOrder>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true },
    memberId:      { type: Schema.Types.ObjectId, required: true },
    memberName:    { type: String, required: true },
    orderNumber:   { type: String, required: true, unique: true },
    status:        { type: String, enum: ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered', 'cancelled'], default: 'pending' },
    items:         { type: [OrderItemSchema], required: true },
    subtotal:      { type: Number, required: true },
    discountAmount:{ type: Number, default: 0 },
    taxAmount:     { type: Number, default: 0 },
    total:         { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'upi', 'wallet', 'card', 'pending'], default: 'pending' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    notes:         String,
    deliveryType:  { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    deliveryAddress: String,
  },
  { timestamps: true }
);

MarketplaceOrderSchema.index({ tenantId: 1, status: 1 });
MarketplaceOrderSchema.index({ tenantId: 1, memberId: 1 });
MarketplaceOrderSchema.index({ orderNumber: 1 });

export default mongoose.model<IMarketplaceOrder>('MarketplaceOrder', MarketplaceOrderSchema);
