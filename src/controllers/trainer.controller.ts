import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Trainer from '../models/Trainer.model';
import User from '../models/User.model';
import Branch from '../models/Branch.model';
import Class from '../models/Class.model';

class TrainerController {
    // POST /trainers
    async createTrainer(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const {
                userId: bodyUserId,
                firstName,
                lastName,
                email,
                mobile,
                specializations: bodySpecs,
                specialization,
                availability = [],
                certifications = [],
                experience,
                pricing,
                revenueSharing,
                branchId: bodyBranchId,
            } = req.body;

            const specializations: string[] = bodySpecs?.length
                ? bodySpecs
                : specialization
                    ? [specialization]
                    : [];

            let userId = bodyUserId;
            let user: any;

            if (!userId) {
                // Onboard mode: create a User account for the new trainer
                if (!firstName || !email) {
                    return res.status(400).json({ success: false, message: 'firstName and email are required to onboard a new trainer' });
                }

                // Resolve branch
                let resolvedBranch = bodyBranchId || req.branchId;
                if (!resolvedBranch) {
                    const branch = await Branch.findOne({ tenantId }).select('_id').lean();
                    resolvedBranch = (branch as any)?._id?.toString();
                }
                if (!resolvedBranch) {
                    return res.status(400).json({ success: false, message: 'No branch found for this gym. Please create a branch first.' });
                }

                // Reuse existing user if email already registered under this tenant
                const existing = await User.findOne({ email: email.toLowerCase(), tenantId });
                if (existing) {
                    user = existing;
                    userId = existing._id.toString();
                } else {
                    const tenantSuffix = tenantId.toString().slice(-6);
                    const placeholderMobile = mobile || `0000${tenantSuffix}`;
                    user = await (User as any).create({
                        tenantId,
                        branchId: resolvedBranch,
                        role: 'trainer',
                        email: email.toLowerCase(),
                        mobile: placeholderMobile,
                        password: 'Trainer@123',
                        firstName,
                        lastName: lastName || '',
                        isActive: true,
                    });
                    userId = user._id.toString();
                }
            } else {
                // Attach mode: find existing user
                user = await User.findOne({ _id: userId, tenantId });
                if (!user) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }
            }

            // Check trainer record does not already exist for this userId
            const existing = await Trainer.findOne({ userId });
            if (existing) {
                return res.status(409).json({ success: false, message: 'Trainer profile already exists for this user' });
            }

            const resolvedBranchId = bodyBranchId || req.branchId || user.branchId;
            if (!resolvedBranchId) {
                return res.status(400).json({ success: false, message: 'branchId is required' });
            }

            const trainer = await Trainer.create({
                tenantId,
                branchId: resolvedBranchId,
                userId,
                specializations,
                certifications,
                experience: experience || { years: 0 },
                availability,
                pricing: pricing || { hourlyRate: 0, sessionPackages: [] },
                revenueSharing: revenueSharing || { enabled: false, percentage: 0 },
                ratings: { average: 0, totalReviews: 0, reviews: [] },
                kpis: {
                    totalClients: 0,
                    activeClients: 0,
                    totalSessions: 0,
                    totalRevenue: 0,
                    averageRating: 0,
                    retentionRate: 0,
                },
                isActive: true,
            });

            // Optionally update user role to trainer
            if (user.role !== 'trainer') {
                await User.findByIdAndUpdate(userId, { role: 'trainer' });
            }

            return res.status(201).json({ success: true, data: trainer });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /trainers
    async getTrainers(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { branchId, isActive, page = '1', limit = '20' } = req.query;
            const filter: Record<string, any> = { tenantId };

            if (branchId) filter.branchId = branchId;
            if (isActive !== undefined) filter.isActive = isActive === 'true';

            const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
            const [trainers, total] = await Promise.all([
                Trainer.find(filter)
                    .populate('userId', 'firstName lastName email mobile avatar profilePicture')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit as string)),
                Trainer.countDocuments(filter),
            ]);

            const enriched = trainers.map((t: any) => {
                const obj = t.toObject ? t.toObject() : { ...t };
                const u = obj.userId as any;
                obj.firstName = u?.firstName ?? '';
                obj.lastName = u?.lastName ?? '';
                obj.email = u?.email ?? '';
                obj.name = `${obj.firstName} ${obj.lastName}`.trim() || obj.email || '—';
                return obj;
            });

            return res.json({
                success: true,
                data: enriched,
                pagination: {
                    total,
                    page: parseInt(page as string),
                    limit: parseInt(limit as string),
                    pages: Math.ceil(total / parseInt(limit as string)),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /trainers/:trainerId
    async getTrainerById(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const trainer = await Trainer.findOne({ _id: req.params.trainerId, tenantId })
                .populate('userId', 'firstName lastName email mobile avatar profilePicture specializations');

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            const trainerObj = (trainer as any).toObject ? (trainer as any).toObject() : trainer;
            const u = trainerObj.userId as any;
            trainerObj.firstName = u?.firstName ?? '';
            trainerObj.lastName = u?.lastName ?? '';
            trainerObj.email = u?.email ?? '';
            trainerObj.name = `${trainerObj.firstName} ${trainerObj.lastName}`.trim() || trainerObj.email || '—';

            return res.json({ success: true, data: trainerObj });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // PUT /trainers/:trainerId
    async updateTrainer(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const allowedFields = [
                'specializations',
                'certifications',
                'experience',
                'availability',
                'pricing',
                'revenueSharing',
                'salary',
                'isActive',
            ];

            const updates: Record<string, any> = {};
            for (const field of allowedFields) {
                if (req.body[field] !== undefined) {
                    updates[field] = req.body[field];
                }
            }

            const trainer = await Trainer.findOneAndUpdate(
                { _id: req.params.trainerId, tenantId },
                { $set: updates },
                { new: true, runValidators: true }
            ).populate('userId', 'firstName lastName email mobile');

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            return res.json({ success: true, data: trainer });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /trainers/:trainerId/certifications
    async addCertification(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { name, issuedBy, issuedDate, expiryDate, certificateUrl } = req.body;

            if (!name || !issuedBy || !issuedDate) {
                return res.status(400).json({ success: false, message: 'name, issuedBy, and issuedDate are required' });
            }

            const trainer = await Trainer.findOneAndUpdate(
                { _id: req.params.trainerId, tenantId },
                {
                    $push: {
                        certifications: {
                            name,
                            issuedBy,
                            issuedDate: new Date(issuedDate),
                            expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                            certificateUrl,
                        },
                    },
                },
                { new: true }
            );

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            return res.json({ success: true, data: trainer });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // PUT /trainers/:trainerId/availability
    async updateAvailability(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { availability } = req.body;

            if (!Array.isArray(availability)) {
                return res.status(400).json({ success: false, message: 'availability must be an array' });
            }

            const trainer = await Trainer.findOneAndUpdate(
                { _id: req.params.trainerId, tenantId },
                { $set: { availability } },
                { new: true, runValidators: true }
            );

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            return res.json({ success: true, data: trainer });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /trainers/:trainerId/ratings
    async addRating(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { memberId, rating, comment } = req.body;

            if (!memberId || !rating) {
                return res.status(400).json({ success: false, message: 'memberId and rating are required' });
            }

            if (rating < 1 || rating > 5) {
                return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
            }

            const trainer = await Trainer.findOne({ _id: req.params.trainerId, tenantId });
            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            trainer.ratings.reviews.push({
                memberId: new mongoose.Types.ObjectId(memberId),
                rating,
                comment: comment || '',
                createdAt: new Date(),
            });

            // Recompute average
            const total = trainer.ratings.reviews.reduce((sum, r) => sum + r.rating, 0);
            trainer.ratings.totalReviews = trainer.ratings.reviews.length;
            trainer.ratings.average = parseFloat((total / trainer.ratings.reviews.length).toFixed(2));
            trainer.kpis.averageRating = trainer.ratings.average;

            await trainer.save();

            return res.json({ success: true, data: trainer });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /trainers/:trainerId/stats
    async getTrainerStats(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const trainer = await Trainer.findOne({ _id: req.params.trainerId, tenantId });
            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            // Count classes taught by this trainer
            const trainerObjId = trainer._id as mongoose.Types.ObjectId;
            const [classesTaught, classesWithEnrollments] = await Promise.all([
                Class.countDocuments({ trainerId: trainerObjId, tenantId, isActive: true }),
                Class.find({ trainerId: trainerObjId, tenantId })
                    .select('name capacity.current capacity.max')
                    .lean(),
            ]);

            const totalEnrolled = classesWithEnrollments.reduce(
                (sum, c) => sum + (c.capacity?.current || 0),
                0
            );

            return res.json({
                success: true,
                data: {
                    classesTaught,
                    totalEnrolledMembers: totalEnrolled,
                    ratingsAverage: trainer.ratings.average,
                    totalReviews: trainer.ratings.totalReviews,
                    kpis: trainer.kpis,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // DELETE /trainers/:trainerId  (soft delete)
    async deleteTrainer(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const trainer = await Trainer.findOneAndUpdate(
                { _id: req.params.trainerId, tenantId },
                { $set: { isActive: false } },
                { new: true }
            );

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            return res.json({ success: true, message: 'Trainer deactivated successfully' });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}

export default new TrainerController();
