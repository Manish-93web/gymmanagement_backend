import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import WorkoutService from '../services/workout.service';
import DietService from '../services/diet.service';

const logWorkoutSchema = z.object({
    memberId: z.string(),
    workoutId: z.string().optional(),
    date: z.string(),
    exercises: z.array(z.object({
        exerciseId: z.string(),
        sets: z.array(z.object({
            reps: z.number().optional(),
            weight: z.number().optional(),
            duration: z.number().optional(),
            completed: z.boolean(),
        })),
    })),
    duration: z.number().optional(),
    caloriesBurned: z.number().optional(),
    notes: z.string().optional(),
});

const calculateMacrosSchema = z.object({
    memberId: z.string(),
    goal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'athletic_performance']),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
});

const createDietPlanSchema = z.object({
    memberId: z.string(),
    trainerId: z.string().optional(),
    name: z.string(),
    goal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'athletic_performance']),
    duration: z.object({
        startDate: z.string(),
        endDate: z.string(),
    }),
    macros: z.object({
        calories: z.number().positive(),
        protein: z.number().positive(),
        carbs: z.number().positive(),
        fats: z.number().positive(),
    }),
    meals: z.array(z.object({
        name: z.string(),
        time: z.string(),
        foods: z.array(z.object({
            name: z.string(),
            quantity: z.number().positive(),
            unit: z.string(),
            calories: z.number().optional(),
            protein: z.number().optional(),
            carbs: z.number().optional(),
            fats: z.number().optional(),
        })),
        notes: z.string().optional(),
    })),
});

export class FitnessController {
    // Workout endpoints
    async logWorkout(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = logWorkoutSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';

            const workoutLog = await WorkoutService.logWorkout({
                ...validatedData,
                tenantId,
                branchId,
                date: new Date(validatedData.date),
            });

            res.status(201).json({ success: true, data: workoutLog });
        } catch (error) {
            next(error);
        }
    }

    async getMemberWorkouts(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const { startDate, endDate } = req.query;
            const tenantId = req.user?.tenantId?.toString() || '';

            const workouts = await WorkoutService.getMemberWorkouts(
                memberId,
                tenantId,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({ success: true, data: workouts });
        } catch (error) {
            next(error);
        }
    }

    async getPersonalRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

            const prs = await WorkoutService.getPersonalRecords(memberId, tenantId);

            res.status(200).json({ success: true, data: prs });
        } catch (error) {
            next(error);
        }
    }

    async getWorkoutStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

            const stats = await WorkoutService.getWorkoutStats(memberId, tenantId);

            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }

    // Diet endpoints
    async calculateMacros(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = calculateMacrosSchema.parse(req.body);

            const macros = await DietService.calculateMacros(
                validatedData.memberId,
                validatedData.goal,
                validatedData.activityLevel
            );

            res.status(200).json({ success: true, data: macros });
        } catch (error) {
            next(error);
        }
    }

    async createDietPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createDietPlanSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';

            const dietPlan = await DietService.createDietPlan({
                ...validatedData,
                tenantId,
                branchId,
                duration: {
                    startDate: new Date(validatedData.duration.startDate),
                    endDate: new Date(validatedData.duration.endDate),
                },
                meals: validatedData.meals.map(meal => ({
                    ...meal,
                    foods: meal.foods.map(food => ({
                        ...food,
                        calories: food.calories || 0,
                        protein: food.protein || 0,
                        carbs: food.carbs || 0,
                        fats: food.fats || 0,
                    })),
                })),
            });

            res.status(201).json({ success: true, data: dietPlan });
        } catch (error) {
            next(error);
        }
    }

    async getMemberDietPlans(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

            const dietPlans = await DietService.getMemberDietPlans(memberId, tenantId);

            res.status(200).json({ success: true, data: dietPlans });
        } catch (error) {
            next(error);
        }
    }

    async logCompliance(req: Request, res: Response, next: NextFunction) {
        try {
            const { dietPlanId } = req.params;
            const { date, mealsFollowed, totalMeals, notes } = req.body;
            const tenantId = req.user?.tenantId?.toString() || '';

            const dietPlan = await DietService.logCompliance(
                dietPlanId,
                tenantId,
                new Date(date),
                mealsFollowed,
                totalMeals,
                notes
            );

            res.status(200).json({ success: true, data: dietPlan });
        } catch (error) {
            next(error);
        }
    }

    async getDietStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';

            const dietStats = await DietService.getComplianceStats(memberId, tenantId);

            res.status(200).json({ success: true, data: dietStats });
        } catch (error) {
            next(error);
        }
    }

    async getDietPlanById(req: Request, res: Response, next: NextFunction) {
        try {
            const { dietPlanId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';
            const plan = await DietService.getDietPlanById(dietPlanId, tenantId);
            if (!plan) return res.status(404).json({ success: false, message: 'Diet plan not found' });
            res.status(200).json({ success: true, data: plan });
        } catch (error) { next(error); }
    }

    async updateDietPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const { dietPlanId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';
            const plan = await DietService.updateDietPlan(dietPlanId, tenantId, req.body);
            if (!plan) return res.status(404).json({ success: false, message: 'Diet plan not found' });
            res.status(200).json({ success: true, data: plan });
        } catch (error) { next(error); }
    }

    async deleteDietPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const { dietPlanId } = req.params;
            const tenantId = req.user?.tenantId?.toString() || '';
            const DietPlan = (await import('../models/DietPlan.model')).default;
            const result = await DietPlan.findOneAndDelete({ _id: dietPlanId, tenantId });
            if (!result) return res.status(404).json({ success: false, message: 'Diet plan not found' });
            res.status(200).json({ success: true, message: 'Diet plan deleted' });
        } catch (error) { next(error); }
    }
}

export default new FitnessController();
