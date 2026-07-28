import mongoose, { Schema, Document } from 'mongoose';

export interface IGymReview extends Document {
  tenantId: string;
  memberId: Schema.Types.ObjectId;
  rating: number;
  title?: string;
  body?: string;
  tags: string[];
  status: 'pending' | 'approved' | 'hidden';
  adminReply?: string;
  adminRepliedAt?: Date;
  visitCount?: number;
  isVerifiedMember: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GymReviewSchema = new Schema<IGymReview>(
  {
    tenantId: { type: String, required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 100, trim: true },
    body: { type: String, maxlength: 1000, trim: true },
    tags: [{ type: String }],
    status: {
      type: String,
      enum: ['pending', 'approved', 'hidden'],
      default: 'pending',
    },
    adminReply: { type: String, maxlength: 500, trim: true },
    adminRepliedAt: { type: Date },
    visitCount: { type: Number },
    isVerifiedMember: { type: Boolean, default: false },
  },
  { timestamps: true }
);

GymReviewSchema.index({ tenantId: 1, status: 1 });
GymReviewSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });
GymReviewSchema.index({ tenantId: 1, rating: 1 });

export default mongoose.model<IGymReview>('GymReview', GymReviewSchema);
