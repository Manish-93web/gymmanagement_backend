import mongoose, { Schema, Document } from 'mongoose'

export interface IStepChallengeParticipant {
  memberId: mongoose.Types.ObjectId
  joinedAt: Date
  totalSteps: number
  daysAchieved: number
  rank?: number
}

export interface IStepChallenge extends Document {
  tenantId: string
  title: string
  description?: string
  dailyTarget: number
  durationDays: number
  startDate: Date
  endDate: Date
  status: 'upcoming' | 'active' | 'completed' | 'cancelled'
  participants: IStepChallengeParticipant[]
  badgeId?: string
  badgeName: string
  rewardPoints: number
  isPublic: boolean
  minPlanCategory?: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const ParticipantSchema = new Schema<IStepChallengeParticipant>(
  {
    memberId:     { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    joinedAt:     { type: Date, default: Date.now },
    totalSteps:   { type: Number, default: 0 },
    daysAchieved: { type: Number, default: 0 },
    rank:         { type: Number },
  },
  { _id: false }
)

const StepChallengeSchema = new Schema<IStepChallenge>(
  {
    tenantId:        { type: String, required: true, index: true },
    title:           { type: String, required: true },
    description:     { type: String },
    dailyTarget:     { type: Number, required: true, enum: [5000, 8000, 10000] },
    durationDays:    { type: Number, default: 30 },
    startDate:       { type: Date, required: true },
    endDate:         { type: Date, required: true },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    participants:     { type: [ParticipantSchema], default: [] },
    badgeId:          { type: String },
    badgeName:        { type: String, required: true },
    rewardPoints:     { type: Number, default: 0 },
    isPublic:         { type: Boolean, default: true },
    minPlanCategory:  { type: String },
    createdBy:        { type: String, required: true },
  },
  { timestamps: true }
)

StepChallengeSchema.index({ tenantId: 1, status: 1 })
StepChallengeSchema.index({ tenantId: 1, startDate: 1 })
StepChallengeSchema.index({ 'participants.memberId': 1 })

export default mongoose.model<IStepChallenge>('StepChallenge', StepChallengeSchema)
