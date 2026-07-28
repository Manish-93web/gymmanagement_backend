import mongoose, { Document, Schema } from 'mongoose';

export interface IEquipment extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  category: 'cardio' | 'strength' | 'functional' | 'stretching' | 'accessories' | 'recovery' | 'other';
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: Date;
  purchasePrice?: number;
  warrantyExpiryDate?: Date;
  location?: string; // floor / zone
  status: 'active' | 'under_maintenance' | 'out_of_order' | 'decommissioned';
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  lastMaintenanceDate?: Date;
  nextMaintenanceDue?: Date;
  maintenanceIntervalDays: number; // e.g. 30 = monthly
  notes?: string;
  imageUrl?: string;
  maintenanceLogs: {
    date: Date;
    type: 'routine' | 'repair' | 'inspection' | 'cleaning' | 'part_replacement';
    description: string;
    performedBy?: string;
    cost?: number;
    nextDue?: Date;
    attachments?: string[];
  }[];
  totalMaintenanceCost: number;
}

const MaintenanceLogSchema = new Schema({
  date:        { type: Date, default: Date.now },
  type:        { type: String, enum: ['routine', 'repair', 'inspection', 'cleaning', 'part_replacement'], required: true },
  description: { type: String, required: true },
  performedBy: String,
  cost:        { type: Number, default: 0 },
  nextDue:     Date,
  attachments: [String],
}, { _id: true });

const EquipmentSchema = new Schema<IEquipment>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    name:        { type: String, required: true, trim: true },
    category:    { type: String, enum: ['cardio', 'strength', 'functional', 'stretching', 'accessories', 'recovery', 'other'], required: true },
    brand:       String,
    model:       String,
    serialNumber: String,
    purchaseDate: Date,
    purchasePrice: Number,
    warrantyExpiryDate: Date,
    location:    String,
    status:      { type: String, enum: ['active', 'under_maintenance', 'out_of_order', 'decommissioned'], default: 'active' },
    condition:   { type: String, enum: ['excellent', 'good', 'fair', 'poor'], default: 'good' },
    lastMaintenanceDate: Date,
    nextMaintenanceDue: Date,
    maintenanceIntervalDays: { type: Number, default: 30 },
    notes:       String,
    imageUrl:    String,
    maintenanceLogs: { type: [MaintenanceLogSchema], default: [] },
    totalMaintenanceCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

EquipmentSchema.index({ tenantId: 1, status: 1 });
EquipmentSchema.index({ tenantId: 1, nextMaintenanceDue: 1 });
EquipmentSchema.index({ tenantId: 1, category: 1 });

export default mongoose.model<IEquipment>('Equipment', EquipmentSchema);
