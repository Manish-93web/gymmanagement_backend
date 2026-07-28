import mongoose, { Schema, Document } from 'mongoose';

export interface IWellnessScore extends Document {
  tenantId: string;
  memberId: mongoose.Types.ObjectId;
  score: number;
  breakdown: {
    attendance: number;
    planAdherence: number;
    stepChallenges: number;
    classAttendance: number;
    nutritionCompliance: number;
  };
  period: {
    month: number;
    year: number;
  };
  calculatedAt: Date;
  sharedWithInsurer: boolean;
  insurerId?: string;
  shareToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WellnessScoreSchema = new Schema<IWellnessScore>(
  {
    tenantId: { type: String, required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    breakdown: {
      attendance:          { type: Number, default: 0, min: 0, max: 20 },
      planAdherence:       { type: Number, default: 0, min: 0, max: 20 },
      stepChallenges:      { type: Number, default: 0, min: 0, max: 20 },
      classAttendance:     { type: Number, default: 0, min: 0, max: 20 },
      nutritionCompliance: { type: Number, default: 0, min: 0, max: 20 },
    },
    period: {
      month: { type: Number, required: true, min: 1, max: 12 },
      year:  { type: Number, required: true },
    },
    calculatedAt:      { type: Date, default: () => new Date() },
    sharedWithInsurer: { type: Boolean, default: false },
    insurerId:         { type: String },
    shareToken:        { type: String, sparse: true },
  },
  { timestamps: true }
);

WellnessScoreSchema.index({ tenantId: 1, memberId: 1 });
WellnessScoreSchema.index({ tenantId: 1, 'period.year': 1, 'period.month': 1 });
WellnessScoreSchema.index({ shareToken: 1 }, { sparse: true });

export default mongoose.model<IWellnessScore>('WellnessScore', WellnessScoreSchema);
