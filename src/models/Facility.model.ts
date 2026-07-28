import mongoose, { Schema, Document } from 'mongoose';

export interface IFacility extends Document {
  tenantId: string;
  name: string;
  facilityType: 'badminton_court' | 'swimming_pool' | 'studio' | 'squash_court' | 'basketball' | 'other';
  description?: string;
  capacity: number;
  pricePerSlot: number;
  slotDurationMinutes: number;
  operatingHours: { start: string; end: string };
  operatingDays: number[];
  rules?: string;
  images: string[];
  isActive: boolean;
}

const FacilitySchema = new Schema<IFacility>({
  tenantId: { type: String, required: true },
  name: { type: String, required: true },
  facilityType: {
    type: String,
    enum: ['badminton_court', 'swimming_pool', 'studio', 'squash_court', 'basketball', 'other'],
    default: 'other',
  },
  description: { type: String },
  capacity: { type: Number, default: 1 },
  pricePerSlot: { type: Number, default: 0 },
  slotDurationMinutes: { type: Number, default: 60 },
  operatingHours: {
    start: { type: String, default: '06:00' },
    end: { type: String, default: '22:00' },
  },
  operatingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  rules: { type: String },
  images: [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

FacilitySchema.index({ tenantId: 1, facilityType: 1 });
FacilitySchema.index({ tenantId: 1, isActive: 1 });

export default mongoose.model<IFacility>('Facility', FacilitySchema);
