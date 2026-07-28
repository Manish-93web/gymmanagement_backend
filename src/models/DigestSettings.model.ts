import mongoose, { Schema, Document } from 'mongoose';

export interface IDigestSettings extends Document {
  tenantId: string;
  enabled: boolean;
  phoneNumber: string;
  timezone: string;
  sendTime: string;
  lastSentAt?: Date;
}

const DigestSettingsSchema = new Schema<IDigestSettings>({
  tenantId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  phoneNumber: { type: String, default: '' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  sendTime: { type: String, default: '08:00' },
  lastSentAt: { type: Date },
}, { timestamps: true });

export default mongoose.model<IDigestSettings>('DigestSettings', DigestSettingsSchema);
