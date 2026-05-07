import mongoose, { Schema, Document } from 'mongoose';

export interface ISaaSInvoice extends Document {
    tenantId: mongoose.Types.ObjectId;
    gymName: string;
    ownerName: string;
    ownerEmail: string;
    invoiceNo: string;
    plan: string;
    billingCycle: string;
    amount: number;
    tax: number;
    taxRate: number;
    discount: number;
    total: number;
    currency: string;
    dueDate: Date;
    paidAt?: Date;
    status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
    paymentMethod?: 'upi' | 'cash' | 'bank_transfer' | 'razorpay' | 'stripe' | 'manual';
    paymentReference?: string;
    periodStart: Date;
    periodEnd: Date;
    notes?: string;
    generatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const SaaSInvoiceSchema = new Schema<ISaaSInvoice>(
    {
        tenantId:         { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        gymName:          { type: String, required: true },
        ownerName:        { type: String, required: true },
        ownerEmail:       { type: String, required: true },
        invoiceNo:        { type: String, required: true, unique: true },
        plan:             { type: String, required: true },
        billingCycle:     { type: String, required: true },
        amount:           { type: Number, required: true, min: 0 },
        tax:              { type: Number, default: 0 },
        taxRate:          { type: Number, default: 0 },
        discount:         { type: Number, default: 0 },
        total:            { type: Number, required: true, min: 0 },
        currency:         { type: String, default: 'INR' },
        dueDate:          { type: Date, required: true },
        paidAt:           { type: Date },
        status:           { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'], default: 'pending' },
        paymentMethod:    { type: String, enum: ['upi', 'cash', 'bank_transfer', 'razorpay', 'stripe', 'manual'] },
        paymentReference: { type: String },
        periodStart:      { type: Date, required: true },
        periodEnd:        { type: Date, required: true },
        notes:            { type: String },
        generatedBy:      { type: String, required: true },
    },
    { timestamps: true }
);

SaaSInvoiceSchema.index({ tenantId: 1, createdAt: -1 });
SaaSInvoiceSchema.index({ status: 1 });
SaaSInvoiceSchema.index({ dueDate: 1 });

export default (mongoose.models.SaaSInvoice as mongoose.Model<ISaaSInvoice>) ||
    mongoose.model<ISaaSInvoice>('SaaSInvoice', SaaSInvoiceSchema);
