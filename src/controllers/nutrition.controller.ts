import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import NutritionLog from '../models/NutritionLog.model';
import Member from '../models/Member.model';

// Common foods database for search
const FOOD_DATABASE = [
    { id: 'rice_100g', name: 'White Rice (cooked)', unit: '100g', calories: 130, protein: 2.7, carbs: 28.2, fats: 0.3, fiber: 0.4 },
    { id: 'brown_rice_100g', name: 'Brown Rice (cooked)', unit: '100g', calories: 123, protein: 2.7, carbs: 25.6, fats: 1.0, fiber: 1.8 },
    { id: 'chicken_breast_100g', name: 'Chicken Breast (cooked)', unit: '100g', calories: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0 },
    { id: 'egg_1', name: 'Egg (whole)', unit: '1 egg (50g)', calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8, fiber: 0 },
    { id: 'milk_200ml', name: 'Whole Milk', unit: '200ml', calories: 130, protein: 6.8, carbs: 9.6, fats: 7.0, fiber: 0 },
    { id: 'banana_1', name: 'Banana (medium)', unit: '1 banana (120g)', calories: 105, protein: 1.3, carbs: 27, fats: 0.4, fiber: 3.1 },
    { id: 'apple_1', name: 'Apple (medium)', unit: '1 apple (180g)', calories: 95, protein: 0.5, carbs: 25.1, fats: 0.3, fiber: 4.4 },
    { id: 'oats_100g', name: 'Oats (dry)', unit: '100g', calories: 389, protein: 16.9, carbs: 66.3, fats: 6.9, fiber: 10.6 },
    { id: 'whey_30g', name: 'Whey Protein Powder', unit: '1 scoop (30g)', calories: 120, protein: 25, carbs: 3, fats: 1.5, fiber: 0 },
    { id: 'sweet_potato_100g', name: 'Sweet Potato (cooked)', unit: '100g', calories: 90, protein: 2, carbs: 20.7, fats: 0.1, fiber: 3.3 },
    { id: 'broccoli_100g', name: 'Broccoli', unit: '100g', calories: 34, protein: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6 },
    { id: 'almonds_28g', name: 'Almonds', unit: '28g (about 23 nuts)', calories: 164, protein: 6, carbs: 6.1, fats: 14.2, fiber: 3.5 },
    { id: 'salmon_100g', name: 'Salmon (cooked)', unit: '100g', calories: 208, protein: 20.4, carbs: 0, fats: 13.4, fiber: 0 },
    { id: 'tuna_100g', name: 'Tuna (canned in water)', unit: '100g', calories: 116, protein: 25.5, carbs: 0, fats: 0.8, fiber: 0 },
    { id: 'paneer_100g', name: 'Paneer', unit: '100g', calories: 296, protein: 18.3, carbs: 1.2, fats: 22.7, fiber: 0 },
    { id: 'dal_100g', name: 'Lentils (cooked)', unit: '100g', calories: 116, protein: 9, carbs: 20, fats: 0.4, fiber: 7.9 },
    { id: 'roti_1', name: 'Wheat Roti/Chapati', unit: '1 roti (30g)', calories: 85, protein: 3.1, carbs: 16.5, fats: 1.2, fiber: 1.9 },
    { id: 'greek_yogurt_100g', name: 'Greek Yogurt (plain)', unit: '100g', calories: 97, protein: 9, carbs: 3.6, fats: 5, fiber: 0 },
    { id: 'peanut_butter_30g', name: 'Peanut Butter', unit: '2 tbsp (30g)', calories: 188, protein: 8, carbs: 6, fats: 16, fiber: 2 },
    { id: 'spinach_100g', name: 'Spinach', unit: '100g', calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2 },
];

const logMealSchema = z.object({
    memberId: z.string().optional(),
    date: z.string().optional(),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout']),
    foods: z.array(z.object({
        foodName: z.string(),
        quantity: z.number().positive(),
        unit: z.string(),
        calories: z.number().min(0).default(0),
        protein: z.number().min(0).default(0),
        carbs: z.number().min(0).default(0),
        fats: z.number().min(0).default(0),
        fiber: z.number().min(0).optional(),
    })),
    notes: z.string().optional(),
    waterIntake: z.number().min(0).optional(),
});

const calculateMacrosSchema = z.object({
    weight: z.number().positive(),
    height: z.number().positive(),
    age: z.number().positive(),
    gender: z.enum(['male', 'female']),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
    goal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'performance']),
});

class NutritionController {
    async searchFood(req: Request, res: Response, next: NextFunction) {
        try {
            const query = ((req.query.q as string) || '').toLowerCase().trim();
            if (!query || query.length < 2) {
                res.json({ success: true, data: FOOD_DATABASE.slice(0, 10) });
                return;
            }
            const results = FOOD_DATABASE.filter(f => f.name.toLowerCase().includes(query));
            res.json({ success: true, data: results });
        } catch (error) {
            next(error);
        }
    }

    async getFoodById(req: Request, res: Response, next: NextFunction) {
        try {
            const food = FOOD_DATABASE.find(f => f.id === req.params.foodId);
            if (!food) {
                res.status(404).json({ success: false, message: 'Food not found' });
                return;
            }
            res.json({ success: true, data: food });
        } catch (error) {
            next(error);
        }
    }

    async logMeal(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?._id;
            if (!tenantId || !userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const data = logMealSchema.parse(req.body);

            let memberId = data.memberId;
            if (!memberId) {
                const member = await Member.findOne({ userId, tenantId });
                if (!member) {
                    res.status(404).json({ success: false, message: 'Member profile not found' });
                    return;
                }
                memberId = member._id.toString();
            }

            const totals = data.foods.reduce(
                (acc, f) => ({
                    calories: acc.calories + f.calories,
                    protein: acc.protein + f.protein,
                    carbs: acc.carbs + f.carbs,
                    fats: acc.fats + f.fats,
                    fiber: acc.fiber + (f.fiber || 0),
                }),
                { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
            );

            const log = await NutritionLog.create({
                tenantId,
                memberId,
                userId,
                date: data.date ? new Date(data.date) : new Date(),
                mealType: data.mealType,
                foods: data.foods,
                totalCalories: Math.round(totals.calories),
                totalProtein: Math.round(totals.protein * 10) / 10,
                totalCarbs: Math.round(totals.carbs * 10) / 10,
                totalFats: Math.round(totals.fats * 10) / 10,
                totalFiber: Math.round(totals.fiber * 10) / 10,
                notes: data.notes,
                waterIntake: data.waterIntake || 0,
            });

            res.status(201).json({ success: true, message: 'Meal logged successfully', data: log });
        } catch (error) {
            next(error);
        }
    }

    async getNutritionLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?._id;
            if (!tenantId || !userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const { memberId, startDate, endDate, page = '1', limit = '20' } = req.query as Record<string, string>;

            let targetMemberId = memberId;
            if (!targetMemberId) {
                const member = await Member.findOne({ userId, tenantId });
                if (member) targetMemberId = member._id.toString();
            }

            if (!targetMemberId) {
                res.json({ success: true, data: { logs: [], pagination: { total: 0, page: 1, pages: 0 } } });
                return;
            }

            const filter: any = { tenantId, memberId: targetMemberId };
            if (startDate || endDate) {
                filter.date = {};
                if (startDate) filter.date.$gte = new Date(startDate);
                if (endDate) filter.date.$lte = new Date(endDate);
            }

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;

            const [logs, total] = await Promise.all([
                NutritionLog.find(filter).sort({ date: -1 }).skip(skip).limit(limitNum),
                NutritionLog.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: {
                    logs,
                    pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async getNutritionSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?._id;
            if (!tenantId || !userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const { memberId, date } = req.query as Record<string, string>;
            const targetDate = date ? new Date(date) : new Date();
            const dayStart = new Date(targetDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(targetDate);
            dayEnd.setHours(23, 59, 59, 999);

            let targetMemberId = memberId;
            if (!targetMemberId) {
                const member = await Member.findOne({ userId, tenantId });
                if (member) targetMemberId = member._id.toString();
            }

            if (!targetMemberId) {
                res.json({ success: true, data: { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0, totalFiber: 0, totalWater: 0, meals: [] } });
                return;
            }

            const logs = await NutritionLog.find({
                tenantId,
                memberId: targetMemberId,
                date: { $gte: dayStart, $lte: dayEnd },
            }).sort({ date: 1 });

            const summary = logs.reduce(
                (acc, log) => ({
                    totalCalories: acc.totalCalories + log.totalCalories,
                    totalProtein: acc.totalProtein + log.totalProtein,
                    totalCarbs: acc.totalCarbs + log.totalCarbs,
                    totalFats: acc.totalFats + log.totalFats,
                    totalFiber: acc.totalFiber + log.totalFiber,
                    totalWater: acc.totalWater + (log.waterIntake || 0),
                }),
                { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0, totalFiber: 0, totalWater: 0 }
            );

            res.json({ success: true, data: { ...summary, meals: logs } });
        } catch (error) {
            next(error);
        }
    }

    async deleteNutritionLog(req: Request, res: Response, next: NextFunction) {
        try {
            const { logId } = req.params;
            const tenantId = req.tenantId;
            const userId = req.user?._id;

            const log = await NutritionLog.findOne({ _id: logId, tenantId });
            if (!log) {
                res.status(404).json({ success: false, message: 'Log not found' });
                return;
            }

            // Only owner or admin can delete
            if (log.userId.toString() !== userId?.toString() && req.user?.role !== 'gym_owner' && req.user?.role !== 'super_admin') {
                res.status(403).json({ success: false, message: 'Not authorized' });
                return;
            }

            await NutritionLog.deleteOne({ _id: logId });
            res.json({ success: true, message: 'Log deleted' });
        } catch (error) {
            next(error);
        }
    }

    async calculateMacros(req: Request, res: Response, next: NextFunction) {
        try {
            const data = calculateMacrosSchema.parse(req.body);

            // Harris-Benedict BMR formula
            let bmr: number;
            if (data.gender === 'male') {
                bmr = 88.362 + 13.397 * data.weight + 4.799 * data.height - 5.677 * data.age;
            } else {
                bmr = 447.593 + 9.247 * data.weight + 3.098 * data.height - 4.330 * data.age;
            }

            const activityMultipliers: Record<string, number> = {
                sedentary: 1.2,
                light: 1.375,
                moderate: 1.55,
                active: 1.725,
                very_active: 1.9,
            };

            let tdee = bmr * activityMultipliers[data.activityLevel];

            let targetCalories: number;
            let proteinRatio: number;
            let carbRatio: number;
            let fatRatio: number;

            switch (data.goal) {
                case 'weight_loss':
                    targetCalories = tdee - 500;
                    proteinRatio = 0.35;
                    carbRatio = 0.35;
                    fatRatio = 0.30;
                    break;
                case 'muscle_gain':
                    targetCalories = tdee + 300;
                    proteinRatio = 0.30;
                    carbRatio = 0.45;
                    fatRatio = 0.25;
                    break;
                case 'performance':
                    targetCalories = tdee + 200;
                    proteinRatio = 0.25;
                    carbRatio = 0.55;
                    fatRatio = 0.20;
                    break;
                default: // maintenance
                    targetCalories = tdee;
                    proteinRatio = 0.30;
                    carbRatio = 0.40;
                    fatRatio = 0.30;
            }

            const protein = Math.round((targetCalories * proteinRatio) / 4); // 4 kcal/g
            const carbs = Math.round((targetCalories * carbRatio) / 4);
            const fats = Math.round((targetCalories * fatRatio) / 9); // 9 kcal/g

            res.json({
                success: true,
                data: {
                    bmr: Math.round(bmr),
                    tdee: Math.round(tdee),
                    targetCalories: Math.round(targetCalories),
                    macros: { protein, carbs, fats },
                    breakdown: {
                        proteinPercent: Math.round(proteinRatio * 100),
                        carbsPercent: Math.round(carbRatio * 100),
                        fatsPercent: Math.round(fatRatio * 100),
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async getWeeklyNutritionStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?._id;
            if (!tenantId || !userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const { memberId } = req.query as Record<string, string>;
            let targetMemberId = memberId;
            if (!targetMemberId) {
                const member = await Member.findOne({ userId, tenantId });
                if (member) targetMemberId = member._id.toString();
            }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const stats = await NutritionLog.aggregate([
                {
                    $match: {
                        tenantId: { $exists: true },
                        ...(targetMemberId ? { memberId: { $toString: targetMemberId } } : {}),
                        date: { $gte: sevenDaysAgo },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                        calories: { $sum: '$totalCalories' },
                        protein: { $sum: '$totalProtein' },
                        carbs: { $sum: '$totalCarbs' },
                        fats: { $sum: '$totalFats' },
                        water: { $sum: '$waterIntake' },
                    },
                },
                { $sort: { _id: 1 } },
            ]);

            res.json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }
}

export default new NutritionController();
