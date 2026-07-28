import mongoose, { Document, Schema } from 'mongoose';

// ─── Sub-document ─────────────────────────────────────────────────────────────

export interface IWebStorySlide {
  slideIndex: number;
  imageUrl?: string;
  backgroundColor: string;
  title?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  emoji?: string;
}

// ─── Main document ────────────────────────────────────────────────────────────

export interface IWebStory extends Document {
  tenantId: string;
  title: string;
  slug: string;
  coverImage?: string;
  coverEmoji?: string;
  category:
    | 'workout'
    | 'nutrition'
    | 'wellness'
    | 'motivation'
    | 'tips'
    | 'recovery'
    | 'success_story';
  slides: IWebStorySlide[];
  slideCount: number;
  tags: string[];
  isPublished: boolean;
  publishedAt?: Date;
  views: number;
  completionRate: number;
  googleWebStoryUrl?: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const WebStorySlideSchema = new Schema<IWebStorySlide>(
  {
    slideIndex:       { type: Number, required: true },
    imageUrl:         String,
    backgroundColor:  { type: String, default: '#1a1a2e' },
    title:            String,
    body:             { type: String, maxlength: 280 },
    ctaText:          String,
    ctaUrl:           String,
    emoji:            String,
  },
  { _id: false }
);

const WebStorySchema = new Schema<IWebStory>(
  {
    tenantId:           { type: String, required: true },
    title:              { type: String, required: true, trim: true },
    slug:               { type: String, required: true, trim: true },
    coverImage:         String,
    coverEmoji:         String,
    category:           {
      type: String,
      enum: ['workout', 'nutrition', 'wellness', 'motivation', 'tips', 'recovery', 'success_story'],
      required: true,
    },
    slides:             {
      type: [WebStorySlideSchema],
      validate: {
        validator: (v: IWebStorySlide[]) => v.length >= 3 && v.length <= 15,
        message: 'A story must have between 3 and 15 slides.',
      },
    },
    slideCount:         { type: Number, default: 0 },
    tags:               { type: [String], default: [] },
    isPublished:        { type: Boolean, default: false },
    publishedAt:        Date,
    views:              { type: Number, default: 0 },
    completionRate:     { type: Number, default: 0 },
    googleWebStoryUrl:  String,
    author:             { type: String, required: true },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

WebStorySchema.index({ tenantId: 1, isPublished: 1 });
WebStorySchema.index({ tenantId: 1, category: 1 });
WebStorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export default mongoose.model<IWebStory>('WebStory', WebStorySchema);
