import mongoose, { Schema, Document } from 'mongoose';

// ─── ArticleRead ───────────────────────────────────────────────────────────────

export interface IArticleRead extends Document {
  tenantId: string;
  memberId: string;
  articleId: string;
  articleTitle: string;
  readAt: Date;
  dateStr: string; // 'YYYY-MM-DD' for streak calculation
  readDurationSeconds?: number;
  category: string;
  createdAt: Date;
}

const ArticleReadSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true },
    memberId: { type: String, required: true },
    articleId: { type: String, required: true },
    articleTitle: { type: String, required: true },
    readAt: { type: Date, default: Date.now },
    dateStr: { type: String, required: true }, // 'YYYY-MM-DD'
    readDurationSeconds: { type: Number },
    category: { type: String, required: true, default: 'General' },
  },
  { timestamps: true }
);

// One read per member per article (prevent double-counting same article)
ArticleReadSchema.index(
  { tenantId: 1, memberId: 1, articleId: 1 },
  { unique: true }
);

// Fast per-member streak queries sorted by date descending
ArticleReadSchema.index({ tenantId: 1, memberId: 1, dateStr: -1 });

export const ArticleRead = mongoose.model<IArticleRead>('ArticleRead', ArticleReadSchema);

// ─── ArticleBookmark ──────────────────────────────────────────────────────────

export interface IArticleBookmark extends Document {
  tenantId: string;
  memberId: string;
  articleId: string;
  articleTitle: string;
  articleCategory: string;
  articleThumbnail?: string;
  bookmarkedAt: Date;
}

const ArticleBookmarkSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true },
    memberId: { type: String, required: true },
    articleId: { type: String, required: true },
    articleTitle: { type: String, required: true },
    articleCategory: { type: String, required: true, default: 'General' },
    articleThumbnail: { type: String },
    bookmarkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One bookmark per member per article
ArticleBookmarkSchema.index(
  { tenantId: 1, memberId: 1, articleId: 1 },
  { unique: true }
);

export const ArticleBookmark = mongoose.model<IArticleBookmark>(
  'ArticleBookmark',
  ArticleBookmarkSchema
);
