import { Request, Response, NextFunction } from 'express';
import workoutService from '../services/workout.service';

export class WorkoutController {
    // Get all workouts
    async getWorkouts(req: Request, res: Response, next: NextFunction) {
        try {
            const { category, level, search, page, limit } = req.query;
            const tenantId = req.user?.tenantId?.toString() || '';

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
            const { id } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

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
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';

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

    // Get exercises
    async getExercises(req: Request, res: Response, next: NextFunction) {
        try {
            const { category, muscleGroup, search, page, limit } = req.query;
            const tenantId = req.user?.tenantId?.toString() || '';

            const exercises = await workoutService.getExercises(
                tenantId,
                category as string,
                muscleGroup as string,
                undefined, // difficulty
                undefined, // equipment
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
