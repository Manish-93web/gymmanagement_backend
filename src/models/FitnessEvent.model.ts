import mongoose, { Document, Schema } from 'mongoose';

export interface IFitnessEvent extends Document {
  tenantId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: 'competition' | 'workshop' | 'marathon' | 'challenge' | 'seminar' | 'bootcamp' | 'open_day' | 'charity' | 'other';
  eventType: 'in_person' | 'online' | 'hybrid';
  status: 'draft' | 'published' | 'registration_closed' | 'ongoing' | 'completed' | 'cancelled';
  coverImageUrl?: string;
  // Schedule
  startDate: Date;
  endDate: Date;
  registrationDeadline?: Date;
  // Location
  venue?: string;
  address?: string;
  city?: string;
  onlineLink?: string;
  // Capacity
  maxParticipants?: number;
  registeredCount: number;
  // Pricing
  isFree: boolean;
  price?: number;
  memberPrice?: number;
  // Registration
  registrations: {
    memberId: mongoose.Types.ObjectId;
    name: string;
    email?: string;
    phone?: string;
    status: 'registered' | 'confirmed' | 'waitlisted' | 'cancelled';
    paymentStatus: 'pending' | 'paid' | 'waived';
    registeredAt: Date;
    checkedIn: boolean;
    checkedInAt?: Date;
  }[];
  // Details
  tags: string[];
  requirements?: string;
  prizes?: string;
  organizer?: string;
  createdBy: mongoose.Types.ObjectId;
}

const RegistrationSchema = new Schema({
  memberId:      { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  name:          { type: String, required: true },
  email:         String,
  phone:         String,
  status:        { type: String, enum: ['registered', 'confirmed', 'waitlisted', 'cancelled'], default: 'registered' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'waived'], default: 'pending' },
  registeredAt:  { type: Date, default: Date.now },
  checkedIn:     { type: Boolean, default: false },
  checkedInAt:   Date,
}, { _id: false });

const FitnessEventSchema = new Schema<IFitnessEvent>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    title:       { type: String, required: true, trim: true },
    description: String,
    category:    { type: String, enum: ['competition', 'workshop', 'marathon', 'challenge', 'seminar', 'bootcamp', 'open_day', 'charity', 'other'], required: true },
    eventType:   { type: String, enum: ['in_person', 'online', 'hybrid'], default: 'in_person' },
    status:      { type: String, enum: ['draft', 'published', 'registration_closed', 'ongoing', 'completed', 'cancelled'], default: 'draft' },
    coverImageUrl: String,
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    registrationDeadline: Date,
    venue:       String,
    address:     String,
    city:        String,
    onlineLink:  String,
    maxParticipants: Number,
    registeredCount: { type: Number, default: 0 },
    isFree:      { type: Boolean, default: true },
    price:       Number,
    memberPrice: Number,
    registrations: { type: [RegistrationSchema], default: [] },
    tags:        { type: [String], default: [] },
    requirements: String,
    prizes:      String,
    organizer:   String,
    createdBy:   { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

FitnessEventSchema.index({ tenantId: 1, status: 1 });
FitnessEventSchema.index({ tenantId: 1, startDate: 1 });
FitnessEventSchema.index({ tenantId: 1, category: 1 });

export default mongoose.model<IFitnessEvent>('FitnessEvent', FitnessEventSchema);
