import mongoose, { Schema, Document } from 'mongoose';

export type InsurancePolicyType = 'health' | 'life' | 'accident' | 'critical_illness';
export type InsuranceLinkStatus = 'active' | 'expired' | 'cancelled' | 'pending_verification';

export interface IInsuranceLink extends Document {
  tenantId: string;
  memberId: mongoose.Types.ObjectId;
  insurerName: string;
  policyNumber: string;
  policyType: InsurancePolicyType;
  premiumDiscountPercent: number;
  status: InsuranceLinkStatus;
  verificationCode?: string;
  verifiedAt?: Date;
  expiryDate: Date;
  irdaiRegistrationNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InsuranceLinkSchema = new Schema<IInsuranceLink>(
  {
    tenantId:    { type: String, required: true, index: true },
    memberId:    { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    insurerName: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    policyType: {
      type: String,
      enum: ['health', 'life', 'accident', 'critical_illness'],
      required: true,
    },
    premiumDiscountPercent: { type: Number, default: 0, min: 0, max: 30 },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending_verification'],
      default: 'pending_verification',
    },
    verificationCode: { type: String },
    verifiedAt:       { type: Date },
    expiryDate:       { type: Date, required: true },
    irdaiRegistrationNumber: { type: String, trim: true },
  },
  { timestamps: true }
);

InsuranceLinkSchema.index({ tenantId: 1, memberId: 1 });
InsuranceLinkSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model<IInsuranceLink>('InsuranceLink', InsuranceLinkSchema);
