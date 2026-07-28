import mongoose, { Document, Schema } from 'mongoose';

export interface ICorporateClient extends Document {
  tenantId: mongoose.Types.ObjectId;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  gstin?: string;
  // Contract
  contractStartDate: Date;
  contractEndDate: Date;
  status: 'active' | 'inactive' | 'expired' | 'pending';
  // Plan
  planType: 'flat_rate' | 'per_head' | 'tiered';
  monthlyRate?: number; // flat rate
  perHeadRate?: number; // per employee
  memberLimit: number;
  // Members
  employeeCount: number;
  enrolledCount: number;
  // Wellness program
  wellnessProgramEnabled: boolean;
  healthCheckupsPerYear: number;
  groupClassesIncluded: boolean;
  nutritionConsultationsIncluded: boolean;
  // Billing
  billingCycle: 'monthly' | 'quarterly' | 'annual';
  invoiceDayOfMonth: number; // 1-28
  // Notes
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
}

const CorporateClientSchema = new Schema<ICorporateClient>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true },
    email:       { type: String, required: true },
    phone:       { type: String, required: true },
    address:     String,
    city:        String,
    gstin:       String,
    contractStartDate: { type: Date, required: true },
    contractEndDate:   { type: Date, required: true },
    status:      { type: String, enum: ['active', 'inactive', 'expired', 'pending'], default: 'pending' },
    planType:    { type: String, enum: ['flat_rate', 'per_head', 'tiered'], default: 'per_head' },
    monthlyRate: Number,
    perHeadRate: Number,
    memberLimit: { type: Number, required: true },
    employeeCount: { type: Number, default: 0 },
    enrolledCount: { type: Number, default: 0 },
    wellnessProgramEnabled: { type: Boolean, default: true },
    healthCheckupsPerYear: { type: Number, default: 2 },
    groupClassesIncluded: { type: Boolean, default: true },
    nutritionConsultationsIncluded: { type: Boolean, default: false },
    billingCycle: { type: String, enum: ['monthly', 'quarterly', 'annual'], default: 'monthly' },
    invoiceDayOfMonth: { type: Number, default: 1 },
    notes:       String,
    createdBy:   { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

CorporateClientSchema.index({ tenantId: 1, status: 1 });
CorporateClientSchema.index({ tenantId: 1, contractEndDate: 1 });

export default mongoose.model<ICorporateClient>('CorporateClient', CorporateClientSchema);
