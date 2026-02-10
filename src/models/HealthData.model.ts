import mongoose, { Schema, Document } from 'mongoose';

export interface IHealthData extends Document {
    memberId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    date: Date;
    metrics: {
        steps: number;
        caloriesBurned: number;
        distanceKm: number;
        sleepMinutes: number;
        heartRate: {
            min: number;
            max: number;
            avg: number;
        };
    };
    source: 'manual' | 'google_fit' | 'apple_health' | 'fitbit' | 'garmin';
    syncedAt: Date;
}

const HealthDataSchema: Schema = new Schema(
    {
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        date: { type: Date, required: true, index: true },
        metrics: {
            steps: { type: Number, default: 0 },
            caloriesBurned: { type: Number, default: 0 },
            distanceKm: { type: Number, default: 0 },
            sleepMinutes: { type: Number, default: 0 },
            heartRate: {
                min: { type: Number, default: 0 },
                max: { type: Number, default: 0 },
                avg: { type: Number, default: 0 },
            },
        },
        source: {
            type: String,
            enum: ['manual', 'google_fit', 'apple_health', 'fitbit', 'garmin'],
            default: 'manual',
        },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Correctly compound index for unique daily records per member
HealthDataSchema.index({ memberId: 1, date: 1 }, { unique: true });

export default mongoose.model<IHealthData>('HealthData', HealthDataSchema);
