import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import PlanService from '../services/plan.service';

// Validation schemas
const createPlanSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['time_based', 'session_based', 'hybrid']),
    duration: z.object({
        value: z.number().positive(),
        unit: z.enum(['day', 'week', 'month', 'quarter', 'half_year', 'year']),
    }).optional(),
    sessions: z.object({
        total: z.number().positive(),
        perWeek: z.number().positive(),
        validityDays: z.number().positive(),
    }).optional(),
    pricing: z.object({
        basePrice: z.number().positive(),
        tax: z.number().min(0),
        discount: z.number().min(0).optional(),
    }),
    features: z.object({
        gymAccess: z.boolean().default(false),
        groupClasses: z.boolean().default(false),
        personalTraining: z.boolean().default(false),
        onlineClasses: z.boolean().default(false),
        dietPlan: z.boolean().default(false),
        locker: z.boolean().default(false),
        freeze: z.boolean().default(false),
        branchTransfer: z.boolean().default(false),
    }).optional(),
});

const createSubscriptionSchema = z.object({
    memberId: z.string(),
    planId: z.string(),
    startDate: z.string().optional(),
    autoRenew: z.boolean().optional(),
});

export class PlanController {
    // Create plan
    async createPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createPlanSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString();

            const plan = await PlanService.createPlan({
                name: validatedData.name,
                description: validatedData.description,
                planType: validatedData.type,
                duration: validatedData.duration,
                sessions: validatedData.sessions,
                pricing: {
                    basePrice: validatedData.pricing.basePrice,
                    tax: validatedData.pricing.tax,
                    discount: validatedData.pricing.discount || 0,
                    finalPrice: 0, // Calculated by service
                },
                features: validatedData.features || {
                    gymAccess: false,
                    groupClasses: false,
                    personalTraining: false,
                    onlineClasses: false,
                    dietPlan: false,
                    locker: false,
                    freeze: false,
                    branchTransfer: false,
                },
                tenantId,
                branchId: branchId || '',
            });

            res.status(201).json({
                success: true,
                data: plan,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get plan by ID
    async getPlanById(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const plan = await PlanService.getPlanById(planId, tenantId);

            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plan not found',
                });
            }

            res.status(200).json({
                success: true,
                data: plan,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get all plans
    async getPlans(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { type, branchId } = req.query;

            const plans = await PlanService.getPlans(
                tenantId,
                type as any,
                branchId as string
            );

            res.status(200).json({
                success: true,
                data: plans,
            });
        } catch (error) {
            next(error);
        }
    }

    // Update plan
    async updatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const plan = await PlanService.updatePlan(planId, tenantId, req.body);

            res.status(200).json({
                success: true,
                message: 'Plan updated successfully',
                data: plan,
            });
        } catch (error) {
            next(error);
        }
    }

    // Deactivate plan
    async deactivatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const { planId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const plan = await PlanService.deactivatePlan(planId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Plan deactivated successfully',
                data: plan,
            });
        } catch (error) {
            next(error);
        }
    }

    // Create subscription
    async createSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createSubscriptionSchema.parse(req.body);
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString();

            const subscription = await PlanService.createSubscription({
                memberId: validatedData.memberId,
                planId: validatedData.planId,
                tenantId,
                branchId: branchId || '',
                startDate: validatedData.startDate ? new Date(validatedData.startDate) : new Date(),
                autoRenew: validatedData.autoRenew || false,
            });

            res.status(201).json({
                success: true,
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // Freeze subscription
    async freezeSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { subscriptionId } = req.params as Record<string, string>;
            const { days, reason } = req.body;
            const tenantId = req.user!.tenantId!.toString();

            const subscription = await PlanService.freezeSubscription(
                subscriptionId,
                tenantId,
                days,
                reason
            );

            res.status(200).json({
                success: true,
                message: 'Subscription frozen successfully',
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // Unfreeze subscription
    async unfreezeSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { subscriptionId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const subscription = await PlanService.unfreezeSubscription(subscriptionId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Subscription unfrozen successfully',
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // Cancel subscription
    async cancelSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { subscriptionId } = req.params as Record<string, string>;
            const { reason, refundAmount } = req.body;
            const tenantId = req.user!.tenantId!.toString();

            const subscription = await PlanService.cancelSubscription(
                subscriptionId,
                tenantId,
                reason,
                refundAmount
            );

            res.status(200).json({
                success: true,
                message: 'Subscription cancelled successfully',
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // Renew subscription
    async renewSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { subscriptionId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const subscription = await PlanService.renewSubscription(subscriptionId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Subscription renewed successfully',
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get member subscriptions
    async getMemberSubscriptions(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const subscriptions = await PlanService.getMemberSubscriptions(memberId, tenantId);

            res.status(200).json({
                success: true,
                data: subscriptions,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new PlanController();

