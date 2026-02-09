import Tenant, { ITenant } from '../models/Tenant.model';
import SaaSPlan from '../models/SaaSPlan.model';
import mongoose from 'mongoose';

export const subscriptionService = {
    /**
     * Transition a tenant to a new plan
     */
    upgradePlan: async (tenantId: string, planSlug: string): Promise<ITenant> => {
        const plan = await SaaSPlan.findOne({ slug: planSlug });
        if (!plan) throw new Error('Plan not found');

        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            {
                saasPlanId: plan._id,
                'subscription.plan': plan.type === 'trial' ? 'trial' : 'pro', // Map to legacy enum
                'subscription.maxBranches': plan.limits.branches,
                'subscription.maxMembers': plan.limits.members,
                'subscription.maxTrainers': plan.limits.trainers,
                lockState: 'none',
                gracePeriodStart: null
            },
            { new: true }
        );

        if (!tenant) throw new Error('Tenant not found');
        return tenant;
    },

    /**
     * Handle Billing Failure Grace Period
     */
    handleBillingFailure: async (tenantId: string): Promise<void> => {
        const tenant = await Tenant.findById(tenantId);
        if (!tenant) return;

        if (!tenant.subscription.gracePeriodStart) {
            tenant.subscription.gracePeriodStart = new Date();
        }

        const daysSinceFailure = Math.floor(
            (Date.now() - tenant.subscription.gracePeriodStart.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceFailure > 15) {
            tenant.lockState = 'hard';
        } else if (daysSinceFailure > 10) {
            tenant.lockState = 'soft';
        }

        await tenant.save();
    },

    /**
     * Enterprise Custom Plan Builder
     */
    createCustomPlan: async (basePlanSlug: string, customConfig: any) => {
        const basePlan = await SaaSPlan.findOne({ slug: basePlanSlug });
        if (!basePlan) throw new Error('Base plan not found');

        const customPlan = new SaaSPlan({
            ...basePlan.toObject(),
            _id: new mongoose.Types.ObjectId(),
            name: `Custom: ${customConfig.gymName}`,
            slug: `custom-${new mongoose.Types.ObjectId()}`,
            type: 'custom',
            limits: { ...basePlan.limits, ...customConfig.limits },
            features: customConfig.features || basePlan.features,
            isDefault: false
        });

        return await customPlan.save();
    },

    /**
     * Data Export for Exit Flow
     */
    prepareExitData: async (tenantId: string) => {
        // Implementation for ZIP + CSV export
        // Logic to gather members, payments, workouts, and media links
        return {
            status: 'pending',
            estimatedTime: '10 minutes',
            downloadUrl: null
        };
    }
};
