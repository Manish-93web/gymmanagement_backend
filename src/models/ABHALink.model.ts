import mongoose, { Document, Schema } from 'mongoose';

export interface IABHALink extends Document {
  tenantId: string;
  memberId: mongoose.Types.ObjectId;
  abhaId: string;
  abhaAddress?: string;
  memberName: string;
  dateOfBirth?: Date;
  gender?: string;
  isVerified: boolean;
  verifiedAt?: Date;
  linkStatus: 'pending_otp' | 'verified' | 'failed' | 'revoked';
  revokedAt?: Date;
  revokedReason?: string;
  lastSyncedAt?: Date;
  dataShareConsent: {
    workouts: boolean;
    nutrition: boolean;
    bodyComposition: boolean;
    hraScore: boolean;
  };
  txnId?: string;
}

const DataShareConsentSchema = new Schema(
  {
    workouts:        { type: Boolean, default: false },
    nutrition:       { type: Boolean, default: false },
    bodyComposition: { type: Boolean, default: false },
    hraScore:        { type: Boolean, default: false },
  },
  { _id: false }
);

const ABHALinkSchema = new Schema<IABHALink>(
  {
    tenantId:    { type: String, required: true, index: true },
    memberId:    { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    abhaId:      { type: String, required: true },
    abhaAddress: { type: String },
    memberName:  { type: String, required: true, default: '' },
    dateOfBirth: { type: Date },
    gender:      { type: String },
    isVerified:  { type: Boolean, default: false },
    verifiedAt:  { type: Date },
    linkStatus: {
      type:    String,
      enum:    ['pending_otp', 'verified', 'failed', 'revoked'],
      default: 'pending_otp',
    },
    revokedAt:       { type: Date },
    revokedReason:   { type: String },
    lastSyncedAt:    { type: Date },
    dataShareConsent: { type: DataShareConsentSchema, default: () => ({}) },
    txnId:           { type: String },
  },
  { timestamps: true }
);

// Unique per-tenant member (one ABHA link per member per tenant)
ABHALinkSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });
ABHALinkSchema.index({ tenantId: 1, abhaId: 1 });
ABHALinkSchema.index({ tenantId: 1, isVerified: 1 });

export default mongoose.model<IABHALink>('ABHALink', ABHALinkSchema);
