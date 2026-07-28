import mongoose, { Schema, Document } from 'mongoose';

export interface IProgressiveChallenge extends Document {
  tenantId: string;
  title: string;
  description: string;
  challengeType: 'progressive_workout' | 'monthly_workout_consistency' | 'monthly_meal_consistency';
  phases: Array<{
    phaseNumber: number;
    targetCount: number;
    durationDays: number;
    badgeName: string;
    badgeEmoji: string;
    rewardPoints: number;
  }>;
  monthlyTarget: number;
  startDate: Date;
  endDate: Date;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  participants: Array<{
    memberId: mongoose.Types.ObjectId;
    enrolledAt: Date;
    currentPhase: number;
    phaseProgress: Array<{
      phase: number;
      completedCount: number;
      completedAt?: Date;
      earnedBadge: boolean;
    }>;
    totalCompleted: number;
    isFinished: boolean;
  }>;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PhaseSchema = new Schema(
  {
    phaseNumber:  { type: Number, required: true },
    targetCount:  { type: Number, required: true },
    durationDays: { type: Number, required: true, default: 30 },
    badgeName:    { type: String, default: '' },
    badgeEmoji:   { type: String, default: '🏅' },
    rewardPoints: { type: Number, default: 0 },
  },
  { _id: false }
);

const PhaseProgressSchema = new Schema(
  {
    phase:          { type: Number, required: true },
    completedCount: { type: Number, default: 0 },
    completedAt:    { type: Date },
    earnedBadge:    { type: Boolean, default: false },
  },
  { _id: false }
);

const ParticipantSchema = new Schema(
  {
    memberId:      { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    enrolledAt:    { type: Date, default: Date.now },
    currentPhase:  { type: Number, default: 1 },
    phaseProgress: { type: [PhaseProgressSchema], default: [] },
    totalCompleted:{ type: Number, default: 0 },
    isFinished:    { type: Boolean, default: false },
  },
  { _id: false }
);

const ProgressiveChallengeSchema = new Schema<IProgressiveChallenge>(
  {
    tenantId: { type: String, required: true, index: true },
    title:    { type: String, required: true },
    description: { type: String, default: '' },
    challengeType: {
      type: String,
      enum: ['progressive_workout', 'monthly_workout_consistency', 'monthly_meal_consistency'],
      required: true,
    },
    phases:       { type: [PhaseSchema], default: [] },
    monthlyTarget:{ type: Number, default: 0 },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date, required: true },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    participants: { type: [ParticipantSchema], default: [] },
    isPublic:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProgressiveChallengeSchema.index({ tenantId: 1, status: 1 });
ProgressiveChallengeSchema.index({ tenantId: 1, challengeType: 1 });
ProgressiveChallengeSchema.index({ tenantId: 1, startDate: 1 });

export default mongoose.model<IProgressiveChallenge>(
  'ProgressiveChallenge',
  ProgressiveChallengeSchema
);
