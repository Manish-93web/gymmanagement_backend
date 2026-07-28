import mongoose, { Schema, Document } from 'mongoose';

export type VoucherStatus = 'active' | 'redeemed' | 'expired' | 'cancelled';

export interface IPharmacyVoucher extends Document {
  tenantId: string;
  memberId: string;
  month: string;
  amount: number;
  voucherCode: string;
  expiresAt: Date;
  isRedeemed: boolean;
  redeemedAt?: Date;
  redeemedFor?: string;
  partnerName?: string;
  partnerRedirectUrl?: string;
  status: VoucherStatus;
  planId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PharmacyVoucherSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    month: { type: String, required: true }, // "2026-07"
    amount: { type: Number, default: 250 },
    voucherCode: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    isRedeemed: { type: Boolean, default: false },
    redeemedAt: { type: Date },
    redeemedFor: { type: String },
    partnerName: { type: String },
    partnerRedirectUrl: { type: String },
    status: {
      type: String,
      enum: ['active', 'redeemed', 'expired', 'cancelled'],
      default: 'active',
    },
    planId: { type: String },
  },
  { timestamps: true }
);

// Compound unique: one voucher per member per month per tenant
PharmacyVoucherSchema.index({ tenantId: 1, memberId: 1, month: 1 }, { unique: true });
PharmacyVoucherSchema.index({ tenantId: 1, status: 1 });
PharmacyVoucherSchema.index({ memberId: 1, status: 1 });
PharmacyVoucherSchema.index({ expiresAt: 1 });

export default mongoose.model<IPharmacyVoucher>('PharmacyVoucher', PharmacyVoucherSchema);
