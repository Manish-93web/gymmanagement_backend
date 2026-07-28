import mongoose, { Document, Schema } from 'mongoose';

export interface IMonthProgress {
  month: 1 | 2 | 3;
  // Pillar 1: Workouts
  target: 6 | 7 | 8;
  achieved: number;
  isComplete: boolean;
  workoutDates: Date[];
  // Pillar 2: Meal Logs
  mealLogTarget: 6 | 7 | 8;
  mealLogsAchieved: number;
  mealLogDates: Date[];
  mealPillarComplete: boolean;
  // Pillar 3: Nutrition Consultations
  consultationTarget: 2;
  consultationsAchieved: number;
  consultationDates: Date[];
  consultationPillarComplete: boolean;
  // Month complete only when all 3 pillars done
  allPillarsComplete: boolean;
  completedAt?: Date;
}

export interface IChallenge678 extends Document {
  tenantId: string;
  memberId: string;
  memberName: string;
  startDate: Date;
  month1StartDate: Date;
  month2StartDate: Date;
  month3StartDate: Date;
  endDate: Date;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  currentMonth: 1 | 2 | 3;
  monthProgress: IMonthProgress[];
  totalWorkoutsCompleted: number;
  totalMealLogsCompleted: number;
  totalConsultationsCompleted: number;
  rewardLocked: boolean;       // true until all 3 pillars complete in all 3 months
  completedAt?: Date;
  badgeEarned: boolean;
  lastVerifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MonthProgressSchema = new Schema<IMonthProgress>(
  {
    month: { type: Number, enum: [1, 2, 3], required: true },
    // Pillar 1 — Workouts
    target: { type: Number, enum: [6, 7, 8], required: true },
    achieved: { type: Number, default: 0 },
    isComplete: { type: Boolean, default: false },
    workoutDates: [{ type: Date }],
    // Pillar 2 — Meal Logs
    mealLogTarget: { type: Number, enum: [6, 7, 8], required: true },
    mealLogsAchieved: { type: Number, default: 0 },
    mealLogDates: [{ type: Date }],
    mealPillarComplete: { type: Boolean, default: false },
    // Pillar 3 — Nutrition Consultations
    consultationTarget: { type: Number, default: 2 },
    consultationsAchieved: { type: Number, default: 0 },
    consultationDates: [{ type: Date }],
    consultationPillarComplete: { type: Boolean, default: false },
    // All 3 pillars
    allPillarsComplete: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { _id: false }
);

const Challenge678Schema = new Schema<IChallenge678>(
  {
    tenantId: { type: String, required: true },
    memberId: { type: String, required: true },
    memberName: { type: String, required: true, default: '' },
    startDate: { type: Date, required: true },
    month1StartDate: { type: Date, required: true },
    month2StartDate: { type: Date, required: true },
    month3StartDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'failed', 'abandoned'],
      default: 'active',
    },
    currentMonth: { type: Number, enum: [1, 2, 3], default: 1 },
    monthProgress: { type: [MonthProgressSchema], default: [] },
    totalWorkoutsCompleted: { type: Number, default: 0 },
    totalMealLogsCompleted: { type: Number, default: 0 },
    totalConsultationsCompleted: { type: Number, default: 0 },
    rewardLocked: { type: Boolean, default: true },
    completedAt: { type: Date },
    badgeEarned: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound index: one active challenge per member per tenant
Challenge678Schema.index({ tenantId: 1, memberId: 1 });
Challenge678Schema.index({ tenantId: 1, status: 1 });

// Pre-save: recalculate currentMonth and totalWorkoutsCompleted
Challenge678Schema.pre('save', async function () {
  const now = new Date();
  const start = this.startDate;

  // Determine current month from elapsed days
  const daysSinceStart = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceStart < 30) {
    this.currentMonth = 1;
  } else if (daysSinceStart < 60) {
    this.currentMonth = 2;
  } else {
    this.currentMonth = 3;
  }

  // Recalculate pillar totals
  this.totalWorkoutsCompleted = this.monthProgress.reduce((sum, mp) => sum + (mp.achieved || 0), 0);
  this.totalMealLogsCompleted = this.monthProgress.reduce((sum, mp) => sum + (mp.mealLogsAchieved || 0), 0);
  this.totalConsultationsCompleted = this.monthProgress.reduce((sum, mp) => sum + (mp.consultationsAchieved || 0), 0);

  // Sync per-month pillar flags
  for (const mp of this.monthProgress) {
    mp.isComplete = mp.achieved >= mp.target;
    mp.mealPillarComplete = mp.mealLogsAchieved >= mp.mealLogTarget;
    mp.consultationPillarComplete = mp.consultationsAchieved >= mp.consultationTarget;
    mp.allPillarsComplete = mp.isComplete && mp.mealPillarComplete && mp.consultationPillarComplete;
  }

  // Reward unlocked only when all 3 months have all 3 pillars complete
  const allDone = this.monthProgress.length === 3 && this.monthProgress.every(mp => mp.allPillarsComplete);
  this.rewardLocked = !allDone;
  if (allDone && !this.completedAt) {
    this.completedAt = new Date();
    this.status = 'completed';
    this.badgeEarned = true;
  }
});

export default mongoose.model<IChallenge678>('Challenge678', Challenge678Schema);
