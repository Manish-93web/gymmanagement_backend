import mongoose, { Document, Schema } from 'mongoose';

export interface IGymProfile extends Document {
  tenantId: mongoose.Types.ObjectId;
  // Basic identity
  gymName: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  galleryImages: string[];
  // Contact
  phone: string;
  email?: string;
  website?: string;
  whatsapp?: string;
  // Location
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  coordinates?: { lat: number; lng: number };
  // Business details
  establishedYear?: number;
  ownerName?: string;
  gstNumber?: string;
  businessCategory: string;
  amenities: string[];
  equipment: string[];
  specializations: string[];
  certifications: string[];
  // Hours
  operatingHours: {
    day: string;
    open: string;
    close: string;
    isClosed: boolean;
  }[];
  // Social
  instagram?: string;
  facebook?: string;
  youtube?: string;
  // Listing
  isPublished: boolean;
  slug: string;
  planHighlights: string[];
  // Stats (cached)
  memberCount?: number;
  reviewCount?: number;
  averageRating?: number;
}

const OperatingHoursSchema = new Schema({
  day:      { type: String, required: true },
  open:     { type: String, default: '06:00' },
  close:    { type: String, default: '22:00' },
  isClosed: { type: Boolean, default: false },
}, { _id: false });

const GymProfileSchema = new Schema<IGymProfile>(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true, unique: true },
    gymName:         { type: String, required: true, trim: true },
    tagline:         String,
    description:     String,
    logoUrl:         String,
    coverImageUrl:   String,
    galleryImages:   { type: [String], default: [] },
    phone:           { type: String, required: true },
    email:           String,
    website:         String,
    whatsapp:        String,
    address:         { type: String, required: true },
    city:            { type: String, required: true },
    state:           { type: String, required: true },
    pincode:         { type: String, required: true },
    country:         { type: String, default: 'India' },
    coordinates:     { lat: Number, lng: Number },
    establishedYear: Number,
    ownerName:       String,
    gstNumber:       String,
    businessCategory: { type: String, default: 'fitness_gym' },
    amenities:       { type: [String], default: [] },
    equipment:       { type: [String], default: [] },
    specializations: { type: [String], default: [] },
    certifications:  { type: [String], default: [] },
    operatingHours:  { type: [OperatingHoursSchema], default: () => [
      { day: 'Monday',    open: '06:00', close: '22:00', isClosed: false },
      { day: 'Tuesday',   open: '06:00', close: '22:00', isClosed: false },
      { day: 'Wednesday', open: '06:00', close: '22:00', isClosed: false },
      { day: 'Thursday',  open: '06:00', close: '22:00', isClosed: false },
      { day: 'Friday',    open: '06:00', close: '22:00', isClosed: false },
      { day: 'Saturday',  open: '07:00', close: '20:00', isClosed: false },
      { day: 'Sunday',    open: '07:00', close: '18:00', isClosed: false },
    ]},
    instagram:       String,
    facebook:        String,
    youtube:         String,
    isPublished:     { type: Boolean, default: false },
    slug:            { type: String },
    planHighlights:  { type: [String], default: [] },
    memberCount:     { type: Number, default: 0 },
    reviewCount:     { type: Number, default: 0 },
    averageRating:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

GymProfileSchema.index({ city: 1, isPublished: 1 });
GymProfileSchema.index({ slug: 1 }, { unique: true, sparse: true });
GymProfileSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });

export default mongoose.model<IGymProfile>('GymProfile', GymProfileSchema);
