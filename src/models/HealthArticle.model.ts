import mongoose, { Schema, Document } from 'mongoose';

export interface IHealthArticle extends Document {
  tenantId?: string | null;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: 'Workouts' | 'Nutrition' | 'Yoga' | 'HealthTips' | 'WeightManagement' | 'Lifestyle' | 'MentalWellness' | 'RecoveryAndSleep';
  author: string;
  authorRole?: string;
  thumbnailUrl?: string;
  tags: string[];
  readTimeMinutes: number;
  isWebStory: boolean;
  webStorySlides?: Array<{ imageUrl: string; heading: string; body?: string }>;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  publishedAt?: Date;
  scheduledFor?: Date;
  viewCount: number;
  likeCount: number;
  isFeatured: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebStorySlideSchema = new Schema(
  {
    imageUrl: { type: String, required: true },
    heading: { type: String, required: true },
    body: { type: String },
  },
  { _id: false }
);

const HealthArticleSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    excerpt: { type: String, maxlength: 150, default: '' },
    body: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Workouts', 'Nutrition', 'Yoga', 'HealthTips', 'WeightManagement', 'Lifestyle', 'MentalWellness', 'RecoveryAndSleep'],
      required: true,
    },
    author: { type: String, required: true, trim: true },
    authorRole: { type: String, trim: true },
    thumbnailUrl: { type: String },
    tags: { type: [String], default: [] },
    readTimeMinutes: { type: Number, default: 1, min: 1 },
    isWebStory: { type: Boolean, default: false },
    webStorySlides: { type: [WebStorySlideSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'published', 'scheduled', 'archived'],
      default: 'draft',
    },
    publishedAt: { type: Date },
    scheduledFor: { type: Date },
    viewCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    seoTitle: { type: String, trim: true },
    seoDescription: { type: String, trim: true },
  },
  { timestamps: true }
);

HealthArticleSchema.index({ slug: 1 });
HealthArticleSchema.index({ tenantId: 1, status: 1 });
HealthArticleSchema.index({ category: 1, status: 1 });
HealthArticleSchema.index({ tags: 1 });
HealthArticleSchema.index({ publishedAt: -1 });

export default mongoose.model<IHealthArticle>('HealthArticle', HealthArticleSchema);
