import Trainer, { ITrainer } from '../models/Trainer.model';
import User from '../models/User.model';
import mongoose from 'mongoose';

export interface CreateTrainerDTO {
    tenantId: string;
    branchId: string;
    userId: string;
    specializations: string[];
    bio?: string;
    experience?: number;
    certifications?: {
        name: string;
        issuedBy: string;
        issuedDate: Date;
        expiryDate?: Date;
        certificateUrl?: string;
    }[];
    pricing?: {
        hourlyRate: number;
        packageRates: {
            sessions: number;
            price: number;
            validityDays: number;
        }[];
    };
}

export interface UpdateAvailabilityDTO {
    day: string;
    slots: {
        startTime: string;
        endTime: string;
        isBooked: boolean;
    }[];
}

export class TrainerService {
    // Create trainer profile
    async createTrainer(data: CreateTrainerDTO): Promise<ITrainer> {
        // Verify user exists and is a trainer
        const user = await User.findById(data.userId);
        if (!user || user.role !== 'trainer') {
            throw new Error('User must have trainer role');
        }

        // Check if trainer profile already exists
        const existingTrainer = await Trainer.findOne({ userId: data.userId });
        if (existingTrainer) {
            throw new Error('Trainer profile already exists for this user');
        }

        const trainer = await (Trainer as any).create(data);
        return trainer;
    }

    // Get trainer by ID
    async getTrainerById(trainerId: string, tenantId: string): Promise<ITrainer | null> {
        return await Trainer.findOne({ _id: trainerId, tenantId }).populate('userId', 'firstName lastName email mobile');
    }

    // Get trainer by user ID
    async getTrainerByUserId(userId: string, tenantId: string): Promise<ITrainer | null> {
        return await Trainer.findOne({ userId, tenantId }).populate('userId', 'firstName lastName email mobile');
    }

    // Update trainer
    async updateTrainer(trainerId: string, tenantId: string, data: Partial<CreateTrainerDTO>): Promise<ITrainer | null> {
        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Add certification
    async addCertification(
        trainerId: string,
        tenantId: string,
        certification: {
            name: string;
            issuedBy: string;
            issuedDate: Date;
            expiryDate?: Date;
            certificateUrl?: string;
        }
    ): Promise<ITrainer | null> {
        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            { $push: { certifications: certification } },
            { new: true }
        );
    }

    // Update availability
    async updateAvailability(
        trainerId: string,
        tenantId: string,
        availability: UpdateAvailabilityDTO[]
    ): Promise<ITrainer | null> {
        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            { $set: { availability } },
            { new: true }
        );
    }

    // Add rating/review
    async addRating(
        trainerId: string,
        memberId: string,
        rating: number,
        review: string | undefined,
        tenantId: string
    ): Promise<ITrainer | null> {
        const trainer = await Trainer.findOne({ _id: trainerId, tenantId });
        if (!trainer) {
            throw new Error('Trainer not found');
        }

        // Calculate new average rating
        const totalRatings = trainer.ratings.reviews.length;
        const currentTotal = trainer.ratings.average * totalRatings;
        const newAverage = (currentTotal + rating) / (totalRatings + 1);

        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            {
                $set: { 'ratings.average': newAverage },
                $inc: { 'ratings.totalReviews': 1 },
                $push: {
                    'ratings.reviews': {
                        memberId,
                        rating,
                        review,
                        date: new Date(),
                    },
                },
            },
            { new: true }
        );
    }

    // Get all trainers
    async getTrainers(
        tenantId: string,
        branchId?: string,
        specialization?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ trainers: ITrainer[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId, isActive: true };
        if (branchId) filter.branchId = branchId;
        if (specialization) filter.specializations = specialization;

        const [trainers, total] = await Promise.all([
            Trainer.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ 'ratings.average': -1 })
                .populate('userId', 'firstName lastName email mobile'),
            Trainer.countDocuments(filter),
        ]);

        return { trainers, total };
    }

    // Update KPIs
    async updateKPIs(trainerId: string, tenantId: string): Promise<ITrainer | null> {
        // This would be called by scheduled jobs to update monthly KPIs
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Calculate KPIs (simplified - would need to aggregate from bookings/classes)
        const kpis = {
            totalSessions: 0, // Would aggregate from Booking model
            totalRevenue: 0, // Would aggregate from Payment model
            activeClients: 0, // Would aggregate from Booking model
            averageRating: 0, // Already tracked
            month: startOfMonth,
        };

        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            { $push: { kpis } },
            { new: true }
        );
    }

    // Deactivate trainer
    async deactivateTrainer(trainerId: string, tenantId: string): Promise<ITrainer | null> {
        return await Trainer.findOneAndUpdate(
            { _id: trainerId, tenantId },
            { $set: { isActive: false } },
            { new: true }
        );
    }

    // Get trainer stats
    async getTrainerStats(trainerId: string, tenantId: string): Promise<any> {
        // Try by _id first, then by userId (for when caller passes user._id)
        let trainer = await Trainer.findOne({ _id: trainerId, tenantId }).catch(() => null);
        if (!trainer) {
            trainer = await Trainer.findOne({ userId: trainerId, tenantId });
        }
        if (!trainer) {
            throw new Error('Trainer not found');
        }

        const Class = (await import('../models/Class.model')).default;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [totalClasses, sessionsToday] = await Promise.all([
            Class.countDocuments({ trainerId: trainer._id, tenantId }),
            Class.countDocuments({ trainerId: trainer._id, tenantId, 'schedule.startDate': { $gte: today, $lt: tomorrow } }),
        ]);

        return {
            rating: trainer.ratings.average,
            reviewCount: trainer.ratings.totalReviews,
            totalMembers: 0,
            totalClasses,
            sessionsToday,
        };
    }
}

export default new TrainerService();
