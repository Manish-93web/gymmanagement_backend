import mongoose, { Document, Schema } from 'mongoose';

export interface IEventPartnership extends Document {
  tenantId: mongoose.Types.ObjectId;
  eventName: string;
  organizer: string;
  description?: string;
  city: string;
  venue?: string;
  eventDate: Date;
  registrationDeadline?: Date;
  registrationUrl?: string;
  discountCode?: string;
  discountPercent?: number;           // e.g. 10 for 10% off registration fee
  partnershipType: 'sponsored' | 'featured' | 'listed';
  targetAudience?: string;            // e.g. "5K runners", "corporate teams"
  category: 'marathon' | 'half_marathon' | 'city_run' | 'cycling' | 'triathlon' | 'sports_event' | 'fitness_camp' | 'other';
  bannerImageUrl?: string;
  maxParticipants?: number;
  interestedCount: number;
  isFeatured: boolean;
  isActive: boolean;
  corporateTeamOption: boolean;       // allow "enter as corporate team" flow
  externalEventId?: string;           // organizer's own ID for deduplication
  createdAt: Date;
  updatedAt: Date;
}

const EventPartnershipSchema = new Schema<IEventPartnership>(
  {
    tenantId:             { type: Schema.Types.ObjectId, required: true },
    eventName:            { type: String, required: true, trim: true },
    organizer:            { type: String, required: true, trim: true },
    description:          { type: String, trim: true },
    city:                 { type: String, required: true, trim: true },
    venue:                { type: String, trim: true },
    eventDate:            { type: Date, required: true },
    registrationDeadline: Date,
    registrationUrl:      { type: String, trim: true },
    discountCode:         { type: String, trim: true },
    discountPercent:      { type: Number, min: 0, max: 100 },
    partnershipType:      { type: String, enum: ['sponsored', 'featured', 'listed'], default: 'listed' },
    targetAudience:       { type: String, trim: true },
    category:             {
      type: String,
      enum: ['marathon', 'half_marathon', 'city_run', 'cycling', 'triathlon', 'sports_event', 'fitness_camp', 'other'],
      default: 'other',
    },
    bannerImageUrl:       { type: String, trim: true },
    maxParticipants:      Number,
    interestedCount:      { type: Number, default: 0 },
    isFeatured:           { type: Boolean, default: false },
    isActive:             { type: Boolean, default: true },
    corporateTeamOption:  { type: Boolean, default: false },
    externalEventId:      { type: String, trim: true },
  },
  { timestamps: true }
);

EventPartnershipSchema.index({ tenantId: 1, isActive: 1 });
EventPartnershipSchema.index({ tenantId: 1, eventDate: 1 });
EventPartnershipSchema.index({ tenantId: 1, city: 1, eventDate: 1 });

export default mongoose.model<IEventPartnership>('EventPartnership', EventPartnershipSchema);
