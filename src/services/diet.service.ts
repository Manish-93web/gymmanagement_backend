import DietPlan, { IDietPlan } from '../models/DietPlan.model';
import Member from '../models/Member.model';

export interface CreateDietPlanDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    trainerId?: string;
    name: string;
    goal: 'weight_loss' | 'muscle_gain' | 'maintenance' | 'athletic_performance';
    duration: {
        startDate: Date;
        endDate: Date;
    };
    macros: {
        calories: number;
        protein: number;
        carbs: number;
        fats: number;
    };
    meals: {
        name: string;
        time: string;
        foods: {
            name: string;
            quantity: number;
            unit: string;
            calories: number;
            protein: number;
            carbs: number;
            fats: number;
        }[];
        notes?: string;
    }[];
}

export class DietService {
    // Calculate macros based on member data
    async calculateMacros(
        memberId: string,
        goal: 'weight_loss' | 'muscle_gain' | 'maintenance' | 'athletic_performance',
        activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
    ): Promise<any> {
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        // Get latest measurement
        const latestMeasurement = member.measurements[member.measurements.length - 1];
        if (!latestMeasurement) {
            throw new Error('No measurements found for member');
        }

        const { weight, height } = latestMeasurement;
        const dob = member.personalInfo.dateOfBirth;
        const age = dob
            ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : 30;

        // Calculate BMR using Mifflin-St Jeor Equation
        let bmr: number;
        if (member.personalInfo.gender === 'male') {
            bmr = 10 * weight + 6.25 * height - 5 * age + 5;
        } else {
            bmr = 10 * weight + 6.25 * height - 5 * age - 161;
        }

        // Activity multipliers
        const activityMultipliers = {
            sedentary: 1.2,
            light: 1.375,
            moderate: 1.55,
            active: 1.725,
            very_active: 1.9,
        };

        const tdee = bmr * activityMultipliers[activityLevel];

        // Adjust calories based on goal
        let calories: number;
        let proteinRatio: number;
        let carbsRatio: number;
        let fatsRatio: number;

        switch (goal) {
            case 'weight_loss':
                calories = tdee - 500; // 500 calorie deficit
                proteinRatio = 0.35;
                carbsRatio = 0.35;
                fatsRatio = 0.30;
                break;
            case 'muscle_gain':
                calories = tdee + 300; // 300 calorie surplus
                proteinRatio = 0.30;
                carbsRatio = 0.45;
                fatsRatio = 0.25;
                break;
            case 'athletic_performance':
                calories = tdee + 200;
                proteinRatio = 0.25;
                carbsRatio = 0.50;
                fatsRatio = 0.25;
                break;
            default: // maintenance
                calories = tdee;
                proteinRatio = 0.30;
                carbsRatio = 0.40;
                fatsRatio = 0.30;
        }

        // Calculate macros in grams
        const protein = Math.round((calories * proteinRatio) / 4); // 4 cal/g
        const carbs = Math.round((calories * carbsRatio) / 4); // 4 cal/g
        const fats = Math.round((calories * fatsRatio) / 9); // 9 cal/g

        return {
            calories: Math.round(calories),
            protein,
            carbs,
            fats,
            bmr: Math.round(bmr),
            tdee: Math.round(tdee),
        };
    }

    // Create diet plan
    async createDietPlan(data: CreateDietPlanDTO): Promise<IDietPlan> {
        const dietPlan = await (DietPlan as any).create(data);
        return dietPlan;
    }

    // Get diet plan by ID
    async getDietPlanById(dietPlanId: string, tenantId: string): Promise<IDietPlan | null> {
        return await DietPlan.findOne({ _id: dietPlanId, tenantId })
            .populate('memberId', 'firstName lastName membershipNumber')
            .populate('trainerId', 'firstName lastName');
    }

    // Get member diet plans
    async getMemberDietPlans(
        memberId: string,
        tenantId: string,
        isActive?: boolean
    ): Promise<IDietPlan[]> {
        const filter: any = { memberId, tenantId };
        if (isActive !== undefined) filter.isActive = isActive;

        return await DietPlan.find(filter)
            .populate('trainerId', 'firstName lastName')
            .sort({ 'duration.startDate': -1 });
    }

    // Update diet plan
    async updateDietPlan(
        dietPlanId: string,
        tenantId: string,
        data: Partial<CreateDietPlanDTO>
    ): Promise<IDietPlan | null> {
        return await DietPlan.findOneAndUpdate(
            { _id: dietPlanId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Log compliance
    async logCompliance(
        dietPlanId: string,
        tenantId: string,
        date: Date,
        mealsFollowed: number,
        totalMeals: number,
        notes?: string
    ): Promise<IDietPlan | null> {
        const percentage = Math.round((mealsFollowed / totalMeals) * 100);

        return await DietPlan.findOneAndUpdate(
            { _id: dietPlanId, tenantId },
            {
                $push: {
                    compliance: {
                        date,
                        mealsFollowed,
                        totalMeals,
                        percentage,
                        notes,
                    },
                },
            },
            { new: true }
        );
    }

    // Get compliance statistics
    async getComplianceStats(dietPlanId: string, tenantId: string): Promise<any> {
        const dietPlan = await DietPlan.findOne({ _id: dietPlanId, tenantId });

        if (!dietPlan) {
            throw new Error('Diet plan not found');
        }

        if (dietPlan.compliance.length === 0) {
            return {
                averageCompliance: 0,
                totalDays: 0,
                streak: 0,
            };
        }

        const totalCompliance = dietPlan.compliance.reduce((sum, c) => sum + c.percentage, 0);
        const averageCompliance = Math.round(totalCompliance / dietPlan.compliance.length);

        // Calculate current streak (days with >80% compliance)
        let streak = 0;
        const sortedCompliance = [...dietPlan.compliance].sort((a, b) => b.date.getTime() - a.date.getTime());

        for (const entry of sortedCompliance) {
            if (entry.percentage >= 80) {
                streak++;
            } else {
                break;
            }
        }

        return {
            averageCompliance,
            totalDays: dietPlan.compliance.length,
            streak,
            last7Days: sortedCompliance.slice(0, 7).map(c => ({
                date: c.date,
                percentage: c.percentage,
            })),
        };
    }

    // Deactivate diet plan
    async deactivateDietPlan(dietPlanId: string, tenantId: string): Promise<IDietPlan | null> {
        return await DietPlan.findOneAndUpdate(
            { _id: dietPlanId, tenantId },
            { $set: { isActive: false } },
            { new: true }
        );
    }
}

export default new DietService();
