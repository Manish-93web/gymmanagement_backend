import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHabitChallengeParticipation extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  /** Matches a HABIT_CHALLENGE_TEMPLATES[*].id key */
  templateId: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  achievedDays: number;
  totalDays: number;
  calendarData: { date: Date; achieved: boolean }[];
  completedAt?: Date;
  rewardGranted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HabitChallengeParticipationSchema = new Schema<IHabitChallengeParticipation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    templateId: { type: String, required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'failed', 'abandoned'],
      default: 'active',
      index: true,
    },
    achievedDays: { type: Number, default: 0 },
    totalDays: { type: Number, required: true },
    calendarData: [
      {
        date: { type: Date, required: true },
        achieved: { type: Boolean, required: true },
      },
    ],
    completedAt: { type: Date },
    rewardGranted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

HabitChallengeParticipationSchema.index({ tenantId: 1, memberId: 1, templateId: 1 });
HabitChallengeParticipationSchema.index({ tenantId: 1, status: 1 });
HabitChallengeParticipationSchema.index({ tenantId: 1, memberId: 1, status: 1 });

const HabitChallengeParticipation: Model<IHabitChallengeParticipation> =
  (mongoose.models['HabitChallengeParticipation'] as Model<IHabitChallengeParticipation>) ??
  mongoose.model<IHabitChallengeParticipation>(
    'HabitChallengeParticipation',
    HabitChallengeParticipationSchema,
  );

export default HabitChallengeParticipation;
