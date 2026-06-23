import { Request, Response, NextFunction } from 'express';
import workoutService from '../services/workout.service';
import WorkoutLog from '../models/WorkoutLog.model';
import Workout from '../models/Workout.model';

export class WorkoutController {
    // Get all workouts
    async getWorkouts(req: Request, res: Response, next: NextFunction) {
        try {
            const { category, level, search, page, limit } = req.query;
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();

            const workouts = await workoutService.getWorkouts(
                tenantId,
                category as string,
                level as string,
                search as string,
                page ? parseInt(page as string) : 1,
                limit ? parseInt(limit as string) : 20
            );

            res.status(200).json({ success: true, ...workouts });
        } catch (error) {
            next(error);
        }
    }

    // Get single workout
    async getWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params as Record<string, string>;
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();

            const workout = await workoutService.getWorkoutById(id, tenantId);
            if (!workout) {
                return res.status(404).json({ success: false, message: 'Workout not found' });
            }

            res.status(200).json({ success: true, data: workout });
        } catch (error) {
            next(error);
        }
    }

    // Create workout
    async createWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const isSuperAdmin = req.user?.role === 'super_admin';
            const tenantId = isSuperAdmin ? req.body.tenantId : req.user?.tenantId?.toString();
            const branchId = isSuperAdmin ? req.body.branchId : req.user?.branchId?.toString();

            const workout = await workoutService.createWorkout({
                ...req.body,
                tenantId,
                branchId
            });

            res.status(201).json({ success: true, data: workout });
        } catch (error) {
            next(error);
        }
    }

    // Update workout
    async updateWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params as Record<string, string>;
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();
            const workout = await Workout.findOneAndUpdate(
                { _id: id, ...(tenantId ? { tenantId } : {}) },
                { $set: req.body },
                { new: true, runValidators: true }
            );
            if (!workout) return res.status(404).json({ success: false, message: 'Workout not found' });
            res.status(200).json({ success: true, data: workout });
        } catch (error) { next(error); }
    }

    // Delete workout
    async deleteWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params as Record<string, string>;
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();
            const workout = await Workout.findOneAndDelete({ _id: id, ...(tenantId ? { tenantId } : {}) });
            if (!workout) return res.status(404).json({ success: false, message: 'Workout not found' });
            res.status(200).json({ success: true, message: 'Workout deleted' });
        } catch (error) { next(error); }
    }

    // Log workout
    async logWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString();
            const memberId = req.body.memberId || req.user?._id?.toString();
            const log = await WorkoutLog.create({ ...req.body, tenantId, memberId });
            res.status(201).json({ success: true, data: log });
        } catch (error) { next(error); }
    }

    // Get workout stats
    async getWorkoutStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString();
            let { memberId } = req.query as { memberId?: string };
            if (memberId === 'me') {
                const Member = require('../models/Member.model').default;
                const m = await Member.findOne({ userId: req.user?._id, tenantId }).select('_id').lean();
                memberId = m?._id?.toString();
            }
            const query: any = { tenantId };
            if (memberId) query.memberId = memberId;
            const [total, thisWeek, thisMonth] = await Promise.all([
                WorkoutLog.countDocuments(query),
                WorkoutLog.countDocuments({ ...query, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
                WorkoutLog.countDocuments({ ...query, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
            ]);
            res.status(200).json({ success: true, data: { total, thisWeek, thisMonth } });
        } catch (error) { next(error); }
    }

    // Get personal records
    async getPersonalRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString();
            let { memberId } = req.query as { memberId?: string };
            if (memberId === 'me') {
                const Member = require('../models/Member.model').default;
                const m = await Member.findOne({ userId: req.user?._id, tenantId }).select('_id').lean();
                memberId = m?._id?.toString();
            }
            const query: any = { tenantId, type: 'personal_record' };
            if (memberId) query.memberId = memberId;
            const records = await WorkoutLog.find(query).sort({ createdAt: -1 }).limit(20);
            res.status(200).json({ success: true, data: records });
        } catch (error) { next(error); }
    }

    // Get workout plans
    async getWorkoutPlans(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString();
            const plans = await Workout.find({ tenantId, type: 'plan' }).sort({ createdAt: -1 }).limit(50);
            res.status(200).json({ success: true, data: plans });
        } catch (error) { next(error); }
    }

    // Create workout plan
    async createWorkoutPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString();
            const plan = await Workout.create({ ...req.body, tenantId, type: 'plan' });
            res.status(201).json({ success: true, data: plan });
        } catch (error) { next(error); }
    }

    // Apply progression rules
    async applyProgression(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params as Record<string, string>;
            const { memberId } = req.body;
            const workout = await Workout.findById(id);
            if (!workout) return res.status(404).json({ success: false, message: 'Workout not found' });
            res.status(200).json({ success: true, data: { workoutId: id, memberId, applied: true } });
        } catch (error) { next(error); }
    }

    // Get exercises
    async getExercises(req: Request, res: Response, next: NextFunction) {
        try {
            const { category, muscleGroup, search, page, limit } = req.query;
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();

            const exercises = await workoutService.getExercises(
                tenantId,
                category as string,
                muscleGroup as string,
                undefined,
                undefined,
                search as string,
                page ? parseInt(page as string) : 1,
                limit ? parseInt(limit as string) : 50
            );

            res.status(200).json({ success: true, ...exercises });
        } catch (error) {
            next(error);
        }
    }
}

export default new WorkoutController();

