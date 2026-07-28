import mongoose, { Document, Schema } from 'mongoose';

export interface ISelfAssessmentQuestion {
  question: string;
  options: string[];
  scores: number[];
}

export interface IEAPResource extends Document {
  title: string;
  category: 'anxiety' | 'burnout' | 'grief' | 'relationships' | 'finance' | 'general' | 'crisis';
  type: 'article' | 'exercise' | 'self_assessment' | 'video' | 'audio';
  body: string;
  duration?: number;
  selfAssessmentQuestions?: ISelfAssessmentQuestion[];
  tags: string[];
  isPublic: boolean;
  sortOrder: number;
}

const SelfAssessmentQuestionSchema = new Schema<ISelfAssessmentQuestion>(
  {
    question: { type: String, required: true },
    options:  { type: [String], required: true },
    scores:   { type: [Number], required: true },
  },
  { _id: false }
);

const EAPResourceSchema = new Schema<IEAPResource>(
  {
    title:    { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['anxiety', 'burnout', 'grief', 'relationships', 'finance', 'general', 'crisis'],
      required: true,
    },
    type: {
      type: String,
      enum: ['article', 'exercise', 'self_assessment', 'video', 'audio'],
      required: true,
    },
    body:                     { type: String, required: true },
    duration:                 Number,
    selfAssessmentQuestions:  [SelfAssessmentQuestionSchema],
    tags:                     { type: [String], default: [] },
    isPublic:                 { type: Boolean, default: true },
    sortOrder:                { type: Number, default: 0 },
  },
  { timestamps: true }
);

EAPResourceSchema.index({ category: 1 });
EAPResourceSchema.index({ type: 1 });
EAPResourceSchema.index({ isPublic: 1 });

export default mongoose.model<IEAPResource>('EAPResource', EAPResourceSchema);
