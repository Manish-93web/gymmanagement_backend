import MembershipPlan, { IMembershipPlan } from '../models/MembershipPlan.model';
import Subscription, { ISubscription } from '../models/Subscription.model';
import Member from '../models/Member.model';
import { addDays, addMonths } from '../utils/helpers.utils';
import mongoose from 'mongoose';

export interface CreatePlanDTO {
    tenantId: string;
    branchId: string;
    name: string;
    description?: string;
    planType: 'time_based' | 'session_based' | 'hybrid';
    duration?: {
        value: number;
        unit: 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';
    };
    sessions?: {
        total: number;
        perWeek: number;
        validityDays: number;
    };
    pricing: {
        basePrice: number;
        tax: number;
        discount: number;
        finalPrice: number;
    };
    features: {
        gymAccess: boolean;
        groupClasses: boolean;
        personalTraining: boolean;
        onlineClasses: boolean;
        dietPlan: boolean;
        locker: boolean;
        freeze: boolean;
        branchTransfer: boolean;
    };
}

export interface CreateSubscriptionDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    planId: string;
    startDate: Date;
    autoRenew: boolean;
}

export class PlanService {
    // Create membership plan
    async createPlan(data: CreatePlanDTO): Promise<IMembershipPlan> {
        const plan = await (MembershipPlan as any).create(data);
        return plan;
    }

    // Get plan by ID
    async getPlanById(planId: string, tenantId: string): Promise<IMembershipPlan | null> {
        return await MembershipPlan.findOne({ _id: planId, tenantId, isActive: true });
    }

    // Get all plans
    async getPlans(
        tenantId: string,
        branchId?: string,
        planType?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ plans: any[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId, isActive: true };
        if (branchId) filter.branchId = branchId;
        if (planType) filter.planType = planType;

        const [plans, total] = await Promise.all([
            MembershipPlan.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
            MembershipPlan.countDocuments(filter),
        ]);

        // Aggregate live currentMembers count per plan
        // NOTE: aggregate $match does NOT auto-cast strings to ObjectId — must cast explicitly
        const planIds = plans.map((p: any) => p._id);
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const memberCounts = await Member.aggregate([
            { $match: { tenantId: tenantOid, planId: { $in: planIds }, status: 'active' } },
            { $group: { _id: '$planId', count: { $sum: 1 } } },
        ]);
        const countMap: Record<string, number> = {};
        for (const row of memberCounts) {
            countMap[row._id.toString()] = row.count;
        }

        const plansWithCount = plans.map((p: any) => ({
            ...p,
            currentMembers: countMap[p._id.toString()] ?? 0,
        }));

        return { plans: plansWithCount, total };
    }

    // Update plan
    async updatePlan(planId: string, tenantId: string, data: Partial<CreatePlanDTO>): Promise<IMembershipPlan | null> {
        return await MembershipPlan.findOneAndUpdate(
            { _id: planId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Deactivate plan
    async deactivatePlan(planId: string, tenantId: string): Promise<IMembershipPlan | null> {
        return await MembershipPlan.findOneAndUpdate(
            { _id: planId, tenantId },
            { $set: { isActive: false } },
            { new: true }
        );
    }

    // Create subscription
    async createSubscription(data: CreateSubscriptionDTO): Promise<ISubscription> {
        const plan = await MembershipPlan.findById(data.planId);

        if (!plan) {
            throw new Error('Plan not found');
        }

        // Calculate end date based on plan duration
        let endDate: Date;
        if (plan.type === 'time_based' && plan.duration) {
            switch (plan.duration) {
                case 'daily':
                    endDate = addDays(data.startDate, plan.durationValue);
                    break;
                case 'weekly':
                    endDate = addDays(data.startDate, plan.durationValue * 7);
                    break;
                case 'monthly':
                    endDate = addMonths(data.startDate, plan.durationValue);
                    break;
                case 'quarterly':
                    endDate = addMonths(data.startDate, plan.durationValue * 3);
                    break;
                case 'half_yearly':
                    endDate = addMonths(data.startDate, plan.durationValue * 6);
                    break;
                case 'yearly':
                    endDate = addMonths(data.startDate, plan.durationValue * 12);
                    break;
                default:
                    endDate = addMonths(data.startDate, 1);
            }
        } else if (plan.type === 'session_based' && plan.sessions?.sessionValidity) {
            endDate = addDays(data.startDate, plan.sessions.sessionValidity);
        } else {
            endDate = addMonths(data.startDate, 1); // Default 1 month
        }

        const subscription = await Subscription.create({
            ...data,
            endDate,
            status: 'active',
            sessions: plan.sessions ? {
                total: plan.sessions.totalSessions,
                used: 0,
                remaining: plan.sessions.totalSessions,
            } : undefined,
        });

        return subscription;
    }

    // Get subscription by ID
    async getSubscriptionById(subscriptionId: string, tenantId: string): Promise<ISubscription | null> {
        return await Subscription.findOne({ _id: subscriptionId, tenantId });
    }

    // Get member subscriptions
    async getMemberSubscriptions(
        memberId: string,
        tenantId: string,
        status?: string
    ): Promise<ISubscription[]> {
        const filter: any = { memberId, tenantId };
        if (status) filter.status = status;

        return await Subscription.find(filter).sort({ createdAt: -1 }).populate('planId');
    }

    // Freeze subscription
    async freezeSubscription(
        subscriptionId: string,
        tenantId: string,
        freezeDays: number,
        reason: string
    ): Promise<ISubscription | null> {
        const subscription = await Subscription.findOne({ _id: subscriptionId, tenantId });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        if (subscription.status !== 'active') {
            throw new Error('Can only freeze active subscriptions');
        }

        const newEndDate = addDays(subscription.endDate, freezeDays);

        return await Subscription.findByIdAndUpdate(
            subscriptionId,
            {
                $set: {
                    status: 'paused',
                    endDate: newEndDate,
                    'freeze.isFrozen': true,
                    'freeze.freezeStartDate': new Date(),
                    'freeze.freezeEndDate': addDays(new Date(), freezeDays),
                    'freeze.daysExtended': freezeDays,
                },
                $push: {
                    'freeze.freezeHistory': {
                        startDate: new Date(),
                        endDate: addDays(new Date(), freezeDays),
                        reason,
                        daysExtended: freezeDays,
                    },
                },
            },
            { new: true }
        );
    }

    // Unfreeze subscription
    async unfreezeSubscription(subscriptionId: string, tenantId: string): Promise<ISubscription | null> {
        return await Subscription.findOneAndUpdate(
            { _id: subscriptionId, tenantId },
            {
                $set: {
                    status: 'active',
                    'freeze.isFrozen': false,
                    'freeze.freezeStartDate': null,
                    'freeze.freezeEndDate': null,
                },
            },
            { new: true }
        );
    }

    // Cancel subscription
    async cancelSubscription(
        subscriptionId: string,
        tenantId: string,
        reason: string,
        refundAmount?: number
    ): Promise<ISubscription | null> {
        return await Subscription.findOneAndUpdate(
            { _id: subscriptionId, tenantId },
            {
                $set: {
                    status: 'cancelled',
                    'cancellation.cancelledAt': new Date(),
                    'cancellation.reason': reason,
                    'cancellation.refundAmount': refundAmount || 0,
                },
            },
            { new: true }
        );
    }

    // Renew subscription
    async renewSubscription(subscriptionId: string, tenantId: string): Promise<ISubscription | null> {
        const subscription = await Subscription.findOne({ _id: subscriptionId, tenantId }).populate('planId');

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        const plan = subscription.planId as any;
        let newEndDate: Date;

        if (plan.planType === 'time_based' && plan.duration) {
            switch (plan.duration.unit) {
                case 'month':
                    newEndDate = addMonths(subscription.endDate, plan.duration.value);
                    break;
                case 'year':
                    newEndDate = addMonths(subscription.endDate, plan.duration.value * 12);
                    break;
                default:
                    newEndDate = addMonths(subscription.endDate, 1);
            }
        } else {
            newEndDate = addMonths(subscription.endDate, 1);
        }

        return await Subscription.findByIdAndUpdate(
            subscriptionId,
            {
                $set: {
                    endDate: newEndDate,
                    status: 'active',
                },
            },
            { new: true }
        );
    }

    // Calculate Pro-Rata Credit
    async calculateProRata(subscriptionId: string, tenantId: string): Promise<number> {
        const subscription = await Subscription.findOne({ _id: subscriptionId, tenantId });
        if (!subscription) return 0;

        const now = new Date();
        if (now >= subscription.endDate || subscription.status !== 'active') return 0;

        const totalDuration = subscription.endDate.getTime() - subscription.startDate.getTime();
        const remainingDuration = subscription.endDate.getTime() - now.getTime();

        if (totalDuration <= 0) return 0;

        const proportion = remainingDuration / totalDuration;
        const credit = subscription.pricing.totalAmount * proportion;

        return Math.floor(credit);
    }
}

export default new PlanService();
