import mongoose, { Document, Schema } from 'mongoose';

export interface IGalleryImage {
  url: string;
  caption?: string;
  order: number;
  uploadedAt: Date;
}

export interface ITestimonial {
  memberName: string;
  memberPhoto?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  date: Date;
  isApproved: boolean;
}

export interface IWebsiteContent extends Document {
  tenantId: string;
  // About section
  aboutText: string;
  tagline?: string;
  foundedYear?: number;
  totalMembers?: number;
  // Gallery
  gallery: IGalleryImage[];
  bannerImages: string[];
  // Amenities (checkbox grid)
  amenities: string[];
  // Service/activity tags
  serviceTags: string[];
  // Testimonials
  testimonials: ITestimonial[];
  // Social links
  socialLinks: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    twitter?: string;
  };
  // Operating hours for display
  operatingHours: {
    weekdays?: string;
    weekends?: string;
    notes?: string;
  };
  // Male/female ratio for display
  malePercent?: number;
  femalePercent?: number;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  // Settings
  showPricing: boolean;
  showTrainers: boolean;
  showGallery: boolean;
  showTestimonials: boolean;
  showMap: boolean;
  isPublished: boolean;
  lastUpdatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const AVAILABLE_AMENITIES: string[] = [
  'Air Conditioning',
  'Locker Room',
  'Changing Rooms',
  'Ladies Only Area',
  'Steam Bath',
  'Sauna',
  'Swimming Pool',
  'Shower',
  'Parking',
  'WiFi',
  'Cafeteria',
  'Juice Bar',
  'Personal Trainer',
  'Group Classes',
  'Yoga Studio',
  'Cardio Zone',
  'Free Weights',
  'Functional Training Area',
  'Zumba',
  'Dance Studio',
  'Martial Arts Area',
  'Water Cooler',
  'Security Camera',
  'Wheelchair Access',
  'Kids Area',
];

const GalleryImageSchema = new Schema<IGalleryImage>(
  {
    url:        { type: String, required: true },
    caption:    String,
    order:      { type: Number, default: 0 },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: true }
);

const TestimonialSchema = new Schema<ITestimonial>(
  {
    memberName:  { type: String, required: true, trim: true },
    memberPhoto: String,
    rating:      { type: Number, required: true, min: 1, max: 5 },
    text:        { type: String, required: true, trim: true },
    date:        { type: Date, default: () => new Date() },
    isApproved:  { type: Boolean, default: false },
  },
  { _id: true }
);

const WebsiteContentSchema = new Schema<IWebsiteContent>(
  {
    tenantId:      { type: String, required: true },
    // About
    aboutText:     { type: String, default: '' },
    tagline:       String,
    foundedYear:   Number,
    totalMembers:  Number,
    // Gallery
    gallery:       { type: [GalleryImageSchema], default: [] },
    bannerImages:  { type: [String], default: [] },
    // Amenities
    amenities:     { type: [String], default: [] },
    // Service tags
    serviceTags:   { type: [String], default: [] },
    // Testimonials
    testimonials:  { type: [TestimonialSchema], default: [] },
    // Social
    socialLinks: {
      facebook:  String,
      instagram: String,
      youtube:   String,
      twitter:   String,
    },
    // Hours
    operatingHours: {
      weekdays: String,
      weekends: String,
      notes:    String,
    },
    // Ratios
    malePercent:   Number,
    femalePercent: Number,
    // SEO
    metaTitle:       String,
    metaDescription: String,
    // Toggles
    showPricing:     { type: Boolean, default: true },
    showTrainers:    { type: Boolean, default: true },
    showGallery:     { type: Boolean, default: true },
    showTestimonials:{ type: Boolean, default: true },
    showMap:         { type: Boolean, default: true },
    isPublished:     { type: Boolean, default: true },
    lastUpdatedBy:   { type: String, default: '' },
  },
  { timestamps: true }
);

WebsiteContentSchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model<IWebsiteContent>('WebsiteContent', WebsiteContentSchema);
