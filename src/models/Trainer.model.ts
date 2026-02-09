import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainer extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    specializations: string[];
    certifications: {
        name: string;
        issuedBy: string;
        issuedDate: Date;
        expiryDate?: Date;
        certificateUrl?: string;
    }[];
    experience: {
        years: number;
        previousGyms?: string[];
        achievements?: string[];
    };
    availability: {
        day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
        isAvailable: boolean;
        slots: {
            startTime: string;
            endTime: string;
            isBooked: boolean;
        }[];
    }[];
    pricing: {
        hourlyRate: number;
        sessionPackages: {
            sessions: number;
            price: number;
            validityDays: number;
        }[];
    };
    revenueSharing: {
        enabled: boolean;
        percentage: number;
        minimumSessions?: number;
    };
    ratings: {
        average: number;
        totalReviews: number;
        reviews: {
            memberId: mongoose.Types.ObjectId;
            rating: number;
            comment: string;
            createdAt: Date;
        }[];
    };
    kpis: {
        totalClients: number;
        activeClients: number;
        totalSessions: number;
        totalRevenue: number;
        averageRating: number;
        retentionRate: number;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const TrainerSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        specializations: [{ type: String }],
        certifications: [
            {
                name: { type: String, required: true },
                issuedBy: { type: String, required: true },
                issuedDate: { type: Date, required: true },
                expiryDate: { type: Date },
                certificateUrl: { type: String },
            },
        ],
        experience: {
            years: { type: Number, required: true },
            previousGyms: [{ type: String }],
            achievements: [{ type: String }],
        },
        availability: [
            {
                day: {
                    type: String,
                    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                    required: true,
                },
                isAvailable: { type: Boolean, default: true },
                slots: [
                    {
                        startTime: { type: String, required: true },
                        endTime: { type: String, required: true },
                        isBooked: { type: Boolean, default: false },
                    },
                ],
            },
        ],
        pricing: {
            hourlyRate: { type: Number, required: true },
            sessionPackages: [
                {
                    sessions: { type: Number, required: true },
                    price: { type: Number, required: true },
                    validityDays: { type: Number, required: true },
                },
            ],
        },
        revenueSharing: {
            enabled: { type: Boolean, default: false },
            percentage: { type: Number, default: 0 },
            minimumSessions: { type: Number },
        },
        ratings: {
            average: { type: Number, default: 0 },
            totalReviews: { type: Number, default: 0 },
            reviews: [
                {
                    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
                    rating: { type: Number, required: true, min: 1, max: 5 },
                    comment: { type: String },
                    createdAt: { type: Date, default: Date.now },
                },
            ],
        },
        kpis: {
            totalClients: { type: Number, default: 0 },
            activeClients: { type: Number, default: 0 },
            totalSessions: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            averageRating: { type: Number, default: 0 },
            retentionRate: { type: Number, default: 0 },
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Indexes
TrainerSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });
TrainerSchema.index({ userId: 1 });
TrainerSchema.index({ 'ratings.average': -1 });

export default mongoose.model<ITrainer>('Trainer', TrainerSchema);
