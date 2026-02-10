import Attendance from '../models/Attendance.model';
import MembershipPlan from '../models/MembershipPlan.model';
import mongoose from 'mongoose';

export class PricingService {
    async getSuggestedPricing(tenantId: string, branchId?: string): Promise<any> {
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
        const branchObjectId = branchId ? new mongoose.Types.ObjectId(branchId) : undefined;

        // 1. Analyze occupancy in last 7 days
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        const attendanceFilter: any = { tenantId: tenantObjectId, checkInTime: { $gte: lastWeek } };
        if (branchObjectId) attendanceFilter.branchId = branchObjectId;

        const occupancyData = await Attendance.aggregate([
            { $match: attendanceFilter },
            {
                $group: {
                    _id: { $hour: '$checkInTime' },
                    avgDailyCheckins: { $sum: 1 }
                }
            },
            {
                $project: {
                    hour: '$_id',
                    occupancyScore: { $divide: ['$avgDailyCheckins', 7] } // avg per day for that hour
                }
            }
        ]);

        // 2. Analyze Plan Demand
        const planFilter: any = { tenantId: tenantObjectId, isActive: true };
        if (branchObjectId) planFilter.branchId = branchObjectId;

        const plans = await MembershipPlan.find(planFilter);

        const suggestedPlans = plans.map(plan => {
            let multiplier = 1.0;

            // Demand based on current members
            if (plan.currentMembers > (plan.maxMembers || 500) * 0.8) {
                multiplier += 0.15; // 15% surge for high demand
            } else if (plan.currentMembers < (plan.maxMembers || 500) * 0.2) {
                multiplier -= 0.1; // 10% discount for low adoption
            }

            // Peak hour occupancy factor
            const peakHour = occupancyData.find(o => o.occupancyScore > 50); // say 50 is busy
            if (peakHour) multiplier += 0.05;

            return {
                planId: plan._id,
                planName: plan.name,
                currentPrice: plan.pricing.finalPrice,
                suggestedMultiplier: parseFloat(multiplier.toFixed(2)),
                suggestedPrice: Math.round(plan.pricing.finalPrice * multiplier),
                surgeReason: multiplier > 1.0 ? 'High demand and peak hour utilization' :
                    multiplier < 1.0 ? 'Low adoption incentive' : 'Stable demand'
            };
        });

        return {
            overallDemandLevel: suggestedPlans.some(p => p.suggestedMultiplier > 1.0) ? 'high' : 'normal',
            suggestions: suggestedPlans
        };
    }
}

export default new PricingService();
