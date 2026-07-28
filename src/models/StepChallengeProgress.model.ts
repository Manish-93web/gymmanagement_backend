import mongoose, { Schema, Document } from 'mongoose'

export interface IStepChallengeProgress extends Document {
  tenantId: string
  challengeId: string
  memberId: string
  date: Date
  stepCount: number
  targetSteps: number
  achieved: boolean
  source: string
  createdAt: Date
  updatedAt: Date
}

const StepChallengeProgressSchema = new Schema<IStepChallengeProgress>(
  {
    tenantId:     { type: String, required: true, index: true },
    challengeId:  { type: String, required: true },
    memberId:     { type: String, required: true },
    date:         { type: Date, required: true },
    stepCount:    { type: Number, required: true, default: 0 },
    targetSteps:  { type: Number, required: true },
    achieved:     { type: Boolean, default: false },
    source:       { type: String, default: 'wearable' },
  },
  { timestamps: true }
)

StepChallengeProgressSchema.index(
  { tenantId: 1, challengeId: 1, memberId: 1, date: 1 },
  { unique: true }
)
StepChallengeProgressSchema.index({ tenantId: 1, memberId: 1, date: 1 })

export default mongoose.model<IStepChallengeProgress>(
  'StepChallengeProgress',
  StepChallengeProgressSchema
)
