import mongoose, { Schema, Document } from 'mongoose';

export interface IFacilitySlot extends Document {
  tenantId: string;
  facilityId: mongoose.Types.ObjectId;
  date: Date;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'cancelled' | 'blocked';
  bookedBy?: mongoose.Types.ObjectId;
  bookedAt?: Date;
  paymentStatus: 'unpaid' | 'paid' | 'waived';
  amount: number;
  notes?: string;
  cancelledAt?: Date;
}

const FacilitySlotSchema = new Schema<IFacilitySlot>({
  tenantId: { type: String, required: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: {
    type: String,
    enum: ['available', 'booked', 'cancelled', 'blocked'],
    default: 'available',
  },
  bookedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  bookedAt: { type: Date },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'waived'], default: 'unpaid' },
  amount: { type: Number, default: 0 },
  notes: { type: String },
  cancelledAt: { type: Date },
}, { timestamps: true });

FacilitySlotSchema.index({ tenantId: 1, facilityId: 1, date: 1 });
FacilitySlotSchema.index({ tenantId: 1, facilityId: 1, date: 1, startTime: 1 }, { unique: true });
FacilitySlotSchema.index({ tenantId: 1, status: 1, date: 1 });
FacilitySlotSchema.index({ tenantId: 1, bookedBy: 1 });

export default mongoose.model<IFacilitySlot>('FacilitySlot', FacilitySlotSchema);
