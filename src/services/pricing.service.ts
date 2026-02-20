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

    async calculateFinalPrice(params: {
        planId: string;
        tenantId: string;
        memberId?: string;
        couponCode?: string;
        durationValue?: number;
        familyMemberCount?: number;
        addOnIds?: string[];
    }): Promise<any> {
        const plan = await MembershipPlan.findOne({ _id: params.planId, tenantId: params.tenantId });
        if (!plan) throw new Error('Plan not found');

        let basePrice = plan.pricing.basePrice;

        // 1. Tiered Pricing Logic
        if (params.durationValue && plan.pricing.pricingTiers && plan.pricing.pricingTiers.length > 0) {
            const tier = plan.pricing.pricingTiers.find(t => t.durationValue === params.durationValue);
            if (tier) {
                basePrice = tier.price;
            }
        }

        // 2. Family Plan Logic
        if (plan.isFamilyPlan && params.familyMemberCount && params.familyMemberCount > 1) {
            const extraMembers = params.familyMemberCount - 1;
            // Apply family discount if defined (e.g. 10% off total for family)
            if (plan.familyDiscount) {
                basePrice = basePrice * (1 - (plan.familyDiscount / 100));
                // Optional: add a surcharge per member if that's the model
            }
        }

        // 3. Add-ons Calculation
        let addonsTotal = 0;
        if (params.addOnIds && params.addOnIds.length > 0) {
            params.addOnIds.forEach(id => {
                const addon = plan.addOns.find(a => a._id?.toString() === id);
                if (addon) {
                    addonsTotal += addon.price;
                }
            });
        }

        let subtotal = basePrice + addonsTotal;

        // 4. Coupon Integration
        let discountAmount = 0;
        let couponInfo = null;

        if (params.couponCode && params.memberId) {
            try {
                // Circular dependency check: dynamically import or use global
                const couponService = (await import('./coupon-referral.service')).default;
                const couponResult = await couponService.validateCoupon(
                    params.couponCode,
                    params.memberId,
                    params.planId,
                    subtotal
                );
                discountAmount = couponResult.discount;
                couponInfo = couponResult.coupon;
                subtotal = couponResult.finalAmount;
            } catch (error: any) {
                console.warn('Coupon validation failed:', error.message);
            }
        }

        // 5. Tax Calculation
        const taxRate = plan.pricing.taxRate || 0;
        const taxAmount = (subtotal * taxRate) / 100;
        const finalPrice = subtotal + taxAmount;

        return {
            basePrice,
            addonsTotal,
            subtotal: basePrice + addonsTotal,
            discountAmount,
            couponInfo,
            taxAmount,
            finalPrice: Math.round(finalPrice),
        };
    }

    async getHappyHourDiscounts(tenantId: string, branchId: string): Promise<any> {
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
        const branchObjectId = new mongoose.Types.ObjectId(branchId);

        // Analyze occupancy by hour for the last 30 days
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30);

        const occupancy = await Attendance.aggregate([
            {
                $match: {
                    tenantId: tenantObjectId,
                    branchId: branchObjectId,
                    checkInTime: { $gte: lastMonth }
                }
            },
            {
                $group: {
                    _id: { $hour: '$checkInTime' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: 1 } } // Lowest attendance first
        ]);

        // Identify bottom 3 off-peak hours
        const offPeakHours = occupancy.slice(0, 3).map(o => o._id);

        const plans = await MembershipPlan.find({ tenantId: tenantObjectId, branchId: branchObjectId, isActive: true });

        const suggestions = offPeakHours.map(hour => {
            const timeString = `${hour}:00 - ${hour + 1}:00`;
            return {
                hour,
                timeSlot: timeString,
                suggestedDiscount: 20, // 20% flat off-peak discount
                applicablePlans: plans.map(p => ({
                    planId: p._id,
                    name: p.name,
                    originalPrice: p.pricing.finalPrice,
                    happyHourPrice: Math.round(p.pricing.finalPrice * 0.8)
                }))
            };
        });

        return {
            message: 'Off-peak hours identified. Automated discounts ready for scheduling.',
            suggestions
        };
    }
}

export default new PricingService();
