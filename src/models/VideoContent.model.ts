import mongoose, { Document, Schema } from 'mongoose';

export interface IVideoContent extends Document {
  tenantId?: mongoose.Types.ObjectId; // null = global library
  title: string;
  description?: string;
  category: 'workout' | 'nutrition' | 'meditation' | 'yoga' | 'breathing' | 'mindfulness' | 'recovery' | 'education' | 'mental_wellness' | 'other';
  subcategory?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  duration: number; // seconds
  instructor?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
  tags: string[];
  isPublished: boolean;
  isPremium: boolean;
  viewCount: number;
  likeCount: number;
  ratingSum: number;
  ratingCount: number;
  language: string;
  equipment?: string[];
  targetMuscles?: string[];
  caloriesBurnEstimate?: number;
  sortOrder: number;
  createdBy?: mongoose.Types.ObjectId;
}

const VideoContentSchema = new Schema<IVideoContent>(
  {
    tenantId:    { type: Schema.Types.ObjectId, default: null },
    title:       { type: String, required: true, trim: true },
    description: String,
    category:    {
      type: String,
      enum: ['workout', 'nutrition', 'meditation', 'yoga', 'breathing', 'mindfulness', 'recovery', 'education', 'mental_wellness', 'other'],
      required: true,
    },
    subcategory:  String,
    thumbnailUrl: String,
    videoUrl:     { type: String, required: true },
    duration:     { type: Number, default: 0 },
    instructor:   String,
    difficulty:   { type: String, enum: ['beginner', 'intermediate', 'advanced', 'all_levels'], default: 'all_levels' },
    tags:         { type: [String], default: [] },
    isPublished:  { type: Boolean, default: true },
    isPremium:    { type: Boolean, default: false },
    viewCount:    { type: Number, default: 0 },
    likeCount:    { type: Number, default: 0 },
    ratingSum:    { type: Number, default: 0 },
    ratingCount:  { type: Number, default: 0 },
    language:     { type: String, default: 'en' },
    equipment:       [String],
    targetMuscles:   [String],
    caloriesBurnEstimate: Number,
    sortOrder:    { type: Number, default: 0 },
    createdBy:    { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

VideoContentSchema.index({ category: 1, isPublished: 1 });
VideoContentSchema.index({ tenantId: 1, isPublished: 1 });
VideoContentSchema.index({ title: 'text', description: 'text', tags: 'text' });

export default mongoose.model<IVideoContent>('VideoContent', VideoContentSchema);
