import mongoose, { Schema, Document } from 'mongoose';

export interface IPointsExpiryConfig extends Document {
  tenantId: string;
  enabled: boolean;
  expiryDays: number;
  warningDays: number;
  autoExpire: boolean;
  notifyMember: boolean;
  lastRunAt?: Date;
}

const PointsExpiryConfigSchema = new Schema<IPointsExpiryConfig>({
  tenantId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  expiryDays: { type: Number, default: 365, enum: [90, 180, 365] },
  warningDays: { type: Number, default: 7 },
  autoExpire: { type: Boolean, default: true },
  notifyMember: { type: Boolean, default: true },
  lastRunAt: { type: Date },
}, { timestamps: true });

export default mongoose.model<IPointsExpiryConfig>('PointsExpiryConfig', PointsExpiryConfigSchema);
