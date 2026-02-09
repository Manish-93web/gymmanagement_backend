import mongoose, { Schema, Document } from 'mongoose';

export interface ISale extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    invoiceNumber: string;
    customerId?: mongoose.Types.ObjectId;
    customerType: 'member' | 'guest';
    items: {
        productId: mongoose.Types.ObjectId;
        productName: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        taxAmount: number;
        total: number;
    }[];
    totals: {
        subtotal: number;
        discount: number;
        taxAmount: number;
        total: number;
    };
    paymentMethod: 'cash' | 'card' | 'upi' | 'wallet';
    paymentStatus: 'completed' | 'pending' | 'refunded';
    soldBy: mongoose.Types.ObjectId;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const SaleSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        invoiceNumber: { type: String, required: true, unique: true },
        customerId: { type: Schema.Types.ObjectId, ref: 'Member' },
        customerType: { type: String, enum: ['member', 'guest'], required: true },
        items: [
            {
                productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
                productName: { type: String, required: true },
                quantity: { type: Number, required: true },
                unitPrice: { type: Number, required: true },
                discount: { type: Number, default: 0 },
                taxAmount: { type: Number, default: 0 },
                total: { type: Number, required: true },
            },
        ],
        totals: {
            subtotal: { type: Number, required: true },
            discount: { type: Number, default: 0 },
            taxAmount: { type: Number, default: 0 },
            total: { type: Number, required: true },
        },
        paymentMethod: {
            type: String,
            enum: ['cash', 'card', 'upi', 'wallet'],
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ['completed', 'pending', 'refunded'],
            default: 'completed',
        },
        soldBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
SaleSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
SaleSchema.index({ customerId: 1 });

export default mongoose.model<ISale>('Sale', SaleSchema);
