import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import TrainerService from '../services/trainer.service';

const createTrainerSchema = z.object({
    userId: z.string(),
    specializations: z.array(z.string()),
    bio: z.string().optional(),
    experience: z.number().min(0).optional(),
    certifications: z.array(z.object({
        name: z.string(),
        issuer: z.string(),
        issueDate: z.string(),
        expiryDate: z.string().optional(),
    })).optional(),
    pricing: z.object({
        hourlyRate: z.number().positive(),
        packageRates: z.array(z.object({
            sessions: z.number().positive(),
            price: z.number().positive(),
        })).optional(),
    }),
});

export class TrainerController {
    async createTrainer(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createTrainerSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const trainer = await TrainerService.createTrainer({
                ...validatedData,
                tenantId,
                branchId,
            });

            res.status(201).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async getTrainerById(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const trainer = await TrainerService.getTrainerById(trainerId, tenantId);

            if (!trainer) {
                return res.status(404).json({ success: false, message: 'Trainer not found' });
            }

            res.status(200).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async getTrainers(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, specialization } = req.query;

            const trainers = await TrainerService.getTrainers(
                tenantId,
                branchId as string,
                specialization as string
            );

            res.status(200).json({ success: true, data: trainers });
        } catch (error) {
            next(error);
        }
    }

    async updateTrainer(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const trainer = await TrainerService.updateTrainer(trainerId, tenantId, req.body);

            res.status(200).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async addCertification(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const trainer = await TrainerService.addCertification(trainerId, req.body, tenantId);

            res.status(200).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async updateAvailability(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const { availability } = req.body;
            const tenantId = req.user!.tenantId.toString();

            const trainer = await TrainerService.updateAvailability(trainerId, availability, tenantId);

            res.status(200).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async addRating(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const { memberId, rating, review } = req.body;
            const tenantId = req.user!.tenantId.toString();

            const trainer = await TrainerService.addRating(trainerId, memberId, rating, review, tenantId);

            res.status(200).json({ success: true, data: trainer });
        } catch (error) {
            next(error);
        }
    }

    async getTrainerStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { trainerId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const stats = await TrainerService.getTrainerStats(trainerId, tenantId);

            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }
}

export default new TrainerController();
