import mongoose, { Schema, Document } from 'mongoose';

export interface IFriendChallenge extends Document {
  tenantId: string;
  challengerId: string;
  challengerName: string;
  challengedId: string;
  challengedName: string;
  type: 'steps' | 'workouts' | 'calories' | 'attendance' | 'weight_loss';
  title: string;
  description?: string;
  targetValue: number;
  unit: string;
  durationDays: number;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'accepted' | 'declined' | 'active' | 'completed' | 'cancelled';
  challengerProgress: number;
  challengedProgress: number;
  winnerId?: string;
  rewardPoints: number;
  acceptedAt?: Date;
  completedAt?: Date;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FriendChallengeSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    challengerId: { type: String, required: true },
    challengerName: { type: String, required: true },
    challengedId: { type: String, required: true },
    challengedName: { type: String, required: true },
    type: {
      type: String,
      enum: ['steps', 'workouts', 'calories', 'attendance', 'weight_loss'],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    targetValue: { type: Number, required: true },
    unit: { type: String, required: true },
    durationDays: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'active', 'completed', 'cancelled'],
      default: 'pending',
    },
    challengerProgress: { type: Number, default: 0 },
    challengedProgress: { type: Number, default: 0 },
    winnerId: { type: String },
    rewardPoints: { type: Number, default: 50 },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    message: { type: String },
  },
  { timestamps: true }
);

FriendChallengeSchema.index({ tenantId: 1, challengerId: 1 });
FriendChallengeSchema.index({ tenantId: 1, challengedId: 1 });
FriendChallengeSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model<IFriendChallenge>('FriendChallenge', FriendChallengeSchema);
