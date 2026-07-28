import mongoose, { Document, Schema } from 'mongoose';

export type CheckupPackage = 'basic' | 'comprehensive' | 'cardiac' | 'diabetes' | 'thyroid' | 'full_body' | 'women' | 'senior';
export type CheckupStatus = 'booked' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
export type SampleType = 'home_collection' | 'lab_visit';

export interface ICheckupTest {
  name: string;
  category: string;
  unit?: string;
  normalRange?: string;
  result?: string;
  resultValue?: number;
  isNormal?: boolean;
  reportedAt?: Date;
}

export interface IHealthCheckup extends Document {
  tenantId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  package: CheckupPackage;
  packageName: string;
  labPartner: string;
  sampleType: SampleType;
  collectionAddress?: string;
  collectionDate?: Date;
  collectionSlot?: string;
  status: CheckupStatus;
  tests: ICheckupTest[];
  totalTests: number;
  reportUrl?: string;
  reportUploadedAt?: Date;
  bookingDate: Date;
  completedDate?: Date;
  amount: number;
  discountedAmount: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  orderId?: string;
  notes?: string;
  bookedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const CheckupTestSchema = new Schema<ICheckupTest>({
  name: { type: String, required: true },
  category: { type: String, required: true },
  unit: String,
  normalRange: String,
  result: String,
  resultValue: Number,
  isNormal: Boolean,
  reportedAt: Date,
}, { _id: false });

const HealthCheckupSchema = new Schema<IHealthCheckup>({
  tenantId: { type: String, required: true, index: true },
  memberId: { type: String, required: true },
  memberName: { type: String, required: true },
  memberPhone: { type: String, required: true },
  package: { type: String, enum: ['basic', 'comprehensive', 'cardiac', 'diabetes', 'thyroid', 'full_body', 'women', 'senior'], required: true },
  packageName: { type: String, required: true },
  labPartner: { type: String, required: true, default: 'Thyrocare' },
  sampleType: { type: String, enum: ['home_collection', 'lab_visit'], default: 'home_collection' },
  collectionAddress: String,
  collectionDate: Date,
  collectionSlot: String,
  status: { type: String, enum: ['booked', 'sample_collected', 'processing', 'completed', 'cancelled'], default: 'booked' },
  tests: [CheckupTestSchema],
  totalTests: { type: Number, default: 0 },
  reportUrl: String,
  reportUploadedAt: Date,
  bookingDate: { type: Date, default: Date.now },
  completedDate: Date,
  amount: { type: Number, required: true },
  discountedAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  orderId: String,
  notes: String,
  bookedBy: { type: String, required: true },
}, { timestamps: true });

HealthCheckupSchema.index({ tenantId: 1, memberId: 1 });
HealthCheckupSchema.index({ tenantId: 1, status: 1 });
HealthCheckupSchema.index({ tenantId: 1, collectionDate: 1 });

export default mongoose.model<IHealthCheckup>('HealthCheckup', HealthCheckupSchema);
