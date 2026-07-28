import mongoose, { Document, Schema } from 'mongoose';

export interface ICreditNote extends Document {
    tenantId: string;
    creditNoteNumber: string;
    originalInvoiceId: string;
    originalInvoiceNumber?: string;
    memberId: string;
    memberName: string;
    memberEmail?: string;
    amount: number;
    reason: 'invoice_voided' | 'overpayment' | 'refund' | 'goodwill' | 'billing_error' | 'membership_cancel';
    reasonDescription?: string;
    status: 'issued' | 'applied' | 'refunded' | 'expired';
    validUntil: Date;
    appliedToInvoiceId?: string;
    refundedAt?: Date;
    refundMethod?: string;
    issuedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const CreditNoteSchema = new Schema<ICreditNote>(
    {
        tenantId: { type: String, required: true },
        creditNoteNumber: { type: String, unique: true, sparse: true },
        originalInvoiceId: { type: String, required: true },
        originalInvoiceNumber: { type: String },
        memberId: { type: String, required: true },
        memberName: { type: String, required: true, trim: true },
        memberEmail: { type: String, trim: true },
        amount: { type: Number, required: true, min: 0 },
        reason: {
            type: String,
            enum: ['invoice_voided', 'overpayment', 'refund', 'goodwill', 'billing_error', 'membership_cancel'],
            required: true,
        },
        reasonDescription: { type: String, trim: true },
        status: {
            type: String,
            enum: ['issued', 'applied', 'refunded', 'expired'],
            default: 'issued',
        },
        validUntil: { type: Date, required: true },
        appliedToInvoiceId: { type: String },
        refundedAt: { type: Date },
        refundMethod: { type: String, trim: true },
        issuedBy: { type: String, required: true },
    },
    { timestamps: true },
);

// Indexes
CreditNoteSchema.index({ tenantId: 1 });
CreditNoteSchema.index({ tenantId: 1, memberId: 1 });
CreditNoteSchema.index({ tenantId: 1, originalInvoiceId: 1 });
CreditNoteSchema.index({ tenantId: 1, status: 1 });

// Auto-generate creditNoteNumber before save
CreditNoteSchema.pre('save', async function (next) {
    if (this.creditNoteNumber) return next();

    try {
        const year = new Date().getFullYear();
        const prefix = `CN-${year}-`;

        // Count existing credit notes for this tenant in this year to derive sequence
        const count = await (this.constructor as typeof mongoose.Model).countDocuments({
            tenantId: this.tenantId,
            creditNoteNumber: { $regex: `^${prefix}` },
        });

        const seq = String(count + 1).padStart(4, '0');
        this.creditNoteNumber = `${prefix}${seq}`;
        next();
    } catch (err: any) {
        next(err);
    }
});

export default mongoose.model<ICreditNote>('CreditNote', CreditNoteSchema);
