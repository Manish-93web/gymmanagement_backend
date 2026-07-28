import mongoose, { Document, Schema } from 'mongoose';

export interface IWearableDataEntry {
  date: Date;
  steps?: number;
  distance?: number;         // km
  activeCalories?: number;
  totalCalories?: number;
  heartRate?: {
    avg: number;
    min: number;
    max: number;
    resting?: number;
  };
  sleep?: {
    duration: number;        // minutes
    deepSleep?: number;
    lightSleep?: number;
    remSleep?: number;
    awake?: number;
    score?: number;          // 0-100
  };
  workouts?: Array<{
    type: string;
    duration: number;        // minutes
    calories?: number;
    heartRateAvg?: number;
    startTime?: Date;
    endTime?: Date;
  }>;
  spo2?: number;             // blood oxygen % (95–100 normal)
  bloodPressure?: {
    systolic: number;        // mmHg (normal: <120)
    diastolic: number;       // mmHg (normal: <80)
    source?: 'manual' | 'wearable';
  };
  stressScore?: number;      // 0-100
  hrvScore?: number;         // heart rate variability ms
  hydration?: number;        // ml
  bodyBattery?: number;      // 0-100 (Garmin-style)
}

export interface IWearableData extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  deviceType: 'fitbit' | 'apple_watch' | 'garmin' | 'samsung_health' | 'google_fit' | 'xiaomi_band' | 'whoop' | 'polar' | 'manual' | 'other';
  deviceId?: string;
  entries: IWearableDataEntry[];
  lastSyncAt: Date;
  connected: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  deviceProfile?: {
    model?: string;
    firmwareVersion?: string;
    batteryLevel?: number;
  };
}

const WearableDataEntrySchema = new Schema<IWearableDataEntry>({
  date: { type: Date, required: true },
  steps: Number,
  distance: Number,
  activeCalories: Number,
  totalCalories: Number,
  heartRate: {
    avg: Number, min: Number, max: Number, resting: Number,
  },
  sleep: {
    duration: Number, deepSleep: Number, lightSleep: Number,
    remSleep: Number, awake: Number, score: Number,
  },
  workouts: [{
    type: String, duration: Number, calories: Number,
    heartRateAvg: Number, startTime: Date, endTime: Date,
  }],
  spo2: Number,
  bloodPressure: {
    systolic: Number,
    diastolic: Number,
    source: { type: String, enum: ['manual', 'wearable'], default: 'manual' },
  },
  stressScore: Number,
  hrvScore: Number,
  hydration: Number,
  bodyBattery: Number,
}, { _id: false });

const WearableDataSchema = new Schema<IWearableData>(
  {
    tenantId:   { type: Schema.Types.ObjectId, required: true },
    memberId:   { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    deviceType: {
      type: String,
      enum: ['fitbit', 'apple_watch', 'garmin', 'samsung_health', 'google_fit', 'xiaomi_band', 'whoop', 'polar', 'manual', 'other'],
      required: true,
    },
    deviceId:        String,
    entries:         [WearableDataEntrySchema],
    lastSyncAt:      { type: Date, default: Date.now },
    connected:       { type: Boolean, default: true },
    accessToken:     { type: String, select: false },
    refreshToken:    { type: String, select: false },
    tokenExpiresAt:  Date,
    deviceProfile: {
      model: String, firmwareVersion: String, batteryLevel: Number,
    },
  },
  { timestamps: true }
);

WearableDataSchema.index({ tenantId: 1, memberId: 1, deviceType: 1 }, { unique: true });
WearableDataSchema.index({ tenantId: 1, memberId: 1 });
WearableDataSchema.index({ 'entries.date': -1 });

export default mongoose.model<IWearableData>('WearableData', WearableDataSchema);
