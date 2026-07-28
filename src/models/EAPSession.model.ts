import mongoose, { Document, Schema } from 'mongoose';

export interface IEAPSession extends Document {
  tenantId: string;
  anonymousId: string;
  sessionType: 'chat' | 'video' | 'phone' | 'self_help';
  counselorType: 'anxiety' | 'burnout' | 'grief' | 'relationships' | 'finance' | 'general';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledAt?: Date;
  completedAt?: Date;
  durationMinutes?: number;
  feedbackRating?: number;
  notes?: string;
  isEmergency: boolean;
}

const EAPSessionSchema = new Schema<IEAPSession>(
  {
    // tenantId is stored ONLY for billing/aggregate stats — never used to identify individual member to employer
    tenantId:       { type: String, required: true },
    // anonymousId is SHA256(memberId + tenantId + salt) — NOT reversible to memberId
    anonymousId:    { type: String, required: true },
    sessionType:    { type: String, enum: ['chat', 'video', 'phone', 'self_help'], default: 'chat' },
    counselorType:  { type: String, enum: ['anxiety', 'burnout', 'grief', 'relationships', 'finance', 'general'], required: true },
    status:         { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },
    scheduledAt:    Date,
    completedAt:    Date,
    durationMinutes: Number,
    feedbackRating: { type: Number, min: 1, max: 5 },
    // Counselor notes are kept anonymized — never contains member-identifiable information
    notes:          String,
    isEmergency:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

EAPSessionSchema.index({ tenantId: 1, status: 1 });
EAPSessionSchema.index({ anonymousId: 1 });
EAPSessionSchema.index({ tenantId: 1, scheduledAt: 1 });

export default mongoose.model<IEAPSession>('EAPSession', EAPSessionSchema);
