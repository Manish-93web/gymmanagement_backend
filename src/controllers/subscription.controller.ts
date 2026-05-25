import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.model';
import MembershipPlan from '../models/MembershipPlan.model';
import Member from '../models/Member.model';
import SubscriptionHistory from '../models/SubscriptionHistory.model';

// ---------------------------------------------------------------------------
// Helper: compute endDate from startDate + plan duration
// ---------------------------------------------------------------------------
function computeEndDate(startDate: Date, duration: string, durationValue: number): Date {
    const end = new Date(startDate);
    switch (duration) {
        case 'daily':
            end.setDate(end.getDate() + durationValue);
            break;
        case 'weekly':
            end.setDate(end.getDate() + durationValue * 7);
            break;
        case 'monthly':
            end.setMonth(end.getMonth() + durationValue);
            break;
        case 'quarterly':
            end.setMonth(end.getMonth() + durationValue * 3);
            break;
        case 'half_yearly':
            end.setMonth(end.getMonth() + durationValue * 6);
            break;
        case 'yearly':
            end.setFullYear(end.getFullYear() + durationValue);
            break;
        default:
            end.setMonth(end.getMonth() + durationValue);
    }
    return end;
}

class SubscriptionController {
    // GET /subscriptions
    async getSubscriptions(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { memberId, status, page = '1', limit = '20' } = req.query;
            const filter: Record<string, any> = { tenantId };

            if (memberId) filter.memberId = memberId;
            if (status) filter.status = status;

            const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
            const [subscriptions, total] = await Promise.all([
                Subscription.find(filter)
                    .populate('memberId', 'firstName lastName email mobile membershipNumber')
                    .populate('planId', 'name duration durationValue pricing')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit as string)),
                Subscription.countDocuments(filter),
            ]);

            return res.json({
                success: true,
                data: subscriptions,
                pagination: {
                    total,
                    page: parseInt(page as string),
                    limit: parseInt(limit as string),
                    pages: Math.ceil(total / parseInt(limit as string)),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /subscriptions
    async createSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { memberId, planId, startDate, autoRenew = false } = req.body;

            if (!memberId || !planId) {
                return res.status(400).json({ success: false, message: 'memberId and planId are required' });
            }

            // Validate member exists under this tenant
            const member = await Member.findOne({ _id: memberId, tenantId });
            if (!member) {
                return res.status(404).json({ success: false, message: 'Member not found' });
            }

            // Look up plan
            const plan = await MembershipPlan.findOne({ _id: planId, tenantId });
            if (!plan) {
                return res.status(404).json({ success: false, message: 'Membership plan not found' });
            }

            const start = startDate ? new Date(startDate) : new Date();
            const end = computeEndDate(start, plan.duration, plan.durationValue);

            const branchId = member.branchId;

            const subscription = await Subscription.create({
                tenantId,
                branchId,
                memberId,
                planId,
                status: 'active',
                startDate: start,
                endDate: end,
                autoRenew,
                pricing: {
                    basePrice: plan.pricing.basePrice,
                    taxAmount: 0,
                    discountAmount: 0,
                    addOnsTotal: 0,
                    totalAmount: plan.pricing.finalPrice,
                },
                addOns: [],
                freezeHistory: [],
                renewalHistory: [],
                notes: '',
            });

            // Update member's planId and membershipExpiry
            await Member.findByIdAndUpdate(memberId, {
                planId,
                membershipExpiry: end,
                membershipStart: start,
                status: 'active',
            });

            // Record history
            await SubscriptionHistory.create({
                tenantId,
                memberId,
                subscriptionId: subscription._id,
                action: 'created',
                newPlanId: planId,
                performedBy: req.user!._id,
                notes: 'Subscription created',
            });

            return res.status(201).json({ success: true, data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /subscriptions/stats
    async getSubscriptionStats(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const tenantObjId = new mongoose.Types.ObjectId(tenantId);

            const [statusCounts, expiringIn7Days, expiringIn30Days] = await Promise.all([
                Subscription.aggregate([
                    { $match: { tenantId: tenantObjId } },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
                Subscription.countDocuments({
                    tenantId,
                    status: 'active',
                    endDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
                }),
                Subscription.countDocuments({
                    tenantId,
                    status: 'active',
                    endDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                }),
            ]);

            const stats: Record<string, number> = {
                active: 0,
                paused: 0,
                frozen: 0,
                expired: 0,
                cancelled: 0,
            };
            statusCounts.forEach((s: any) => {
                stats[s._id] = s.count;
            });

            return res.json({
                success: true,
                data: {
                    ...stats,
                    total: Object.values(stats).reduce((a, b) => a + b, 0),
                    expiringIn7Days,
                    expiringIn30Days,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /subscriptions/member/:memberId
    async getMemberSubscriptions(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { memberId } = req.params;

            const subscriptions = await Subscription.find({ tenantId, memberId })
                .populate('planId', 'name duration durationValue pricing')
                .sort({ createdAt: -1 });

            return res.json({ success: true, data: subscriptions });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /subscriptions/:id
    async getSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId })
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .populate('planId', 'name duration durationValue pricing features');

            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            return res.json({ success: true, data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /subscriptions/:id/history
    async getSubscriptionHistory(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            const history = await SubscriptionHistory.find({ subscriptionId: req.params.id })
                .populate('performedBy', 'firstName lastName role')
                .sort({ createdAt: -1 });

            return res.json({ success: true, data: history });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /subscriptions/:id/cancel
    async cancelSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { reason } = req.body;

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            if (subscription.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Subscription is already cancelled' });
            }

            subscription.status = 'cancelled';
            subscription.cancellation = {
                cancelledAt: new Date(),
                cancelledBy: req.user!._id as mongoose.Types.ObjectId,
                reason: reason || '',
                refundAmount: 0,
                refundStatus: 'pending',
            };
            await subscription.save();

            await SubscriptionHistory.create({
                tenantId,
                memberId: subscription.memberId,
                subscriptionId: subscription._id,
                action: 'cancelled',
                performedBy: req.user!._id,
                notes: reason || 'Cancelled by user',
            });

            return res.json({ success: true, message: 'Subscription cancelled', data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /subscriptions/:id/freeze
    async freezeSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { freezeStartDate, freezeEndDate, reason } = req.body;

            if (!freezeStartDate || !freezeEndDate) {
                return res.status(400).json({ success: false, message: 'freezeStartDate and freezeEndDate are required' });
            }

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            if (subscription.status !== 'active') {
                return res.status(400).json({ success: false, message: 'Only active subscriptions can be frozen' });
            }

            const start = new Date(freezeStartDate);
            const end = new Date(freezeEndDate);

            subscription.status = 'frozen';
            subscription.currentFreeze = {
                startDate: start,
                plannedEndDate: end,
                reason: reason || '',
            };
            await subscription.save();

            await SubscriptionHistory.create({
                tenantId,
                memberId: subscription.memberId,
                subscriptionId: subscription._id,
                action: 'frozen',
                performedBy: req.user!._id,
                notes: reason || 'Frozen by user',
                metadata: { freezeStartDate: start, freezeEndDate: end },
            });

            return res.json({ success: true, message: 'Subscription frozen', data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /subscriptions/:id/unfreeze
    async unfreezeSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            if (subscription.status !== 'frozen') {
                return res.status(400).json({ success: false, message: 'Subscription is not frozen' });
            }

            // Move currentFreeze to freezeHistory
            if (subscription.currentFreeze?.startDate) {
                const freezeStart = subscription.currentFreeze.startDate;
                const freezeEnd = new Date(); // actual unfreeze date
                const daysExtended = Math.ceil(
                    (freezeEnd.getTime() - freezeStart.getTime()) / (1000 * 60 * 60 * 24)
                );

                subscription.freezeHistory.push({
                    startDate: freezeStart,
                    endDate: freezeEnd,
                    reason: subscription.currentFreeze.reason || '',
                    approvedBy: req.user!._id as mongoose.Types.ObjectId,
                    daysExtended,
                });

                // Extend endDate by the frozen days
                const newEndDate = new Date(subscription.endDate);
                newEndDate.setDate(newEndDate.getDate() + daysExtended);
                subscription.endDate = newEndDate;
            }

            subscription.status = 'active';
            subscription.set('currentFreeze', undefined);
            await subscription.save();

            await SubscriptionHistory.create({
                tenantId,
                memberId: subscription.memberId,
                subscriptionId: subscription._id,
                action: 'unfrozen',
                performedBy: req.user!._id,
                notes: 'Subscription unfrozen',
            });

            return res.json({ success: true, message: 'Subscription unfrozen', data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /subscriptions/:id/renew
    async renewSubscription(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { newEndDate, planId } = req.body;

            const subscription = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!subscription) {
                return res.status(404).json({ success: false, message: 'Subscription not found' });
            }

            const previousEndDate = subscription.endDate;
            let calculatedEndDate: Date;
            let renewalPlanId = subscription.planId;

            if (newEndDate) {
                calculatedEndDate = new Date(newEndDate);
            } else if (planId) {
                // Use a new plan to compute the renewal duration
                const plan = await MembershipPlan.findOne({ _id: planId, tenantId });
                if (!plan) {
                    return res.status(404).json({ success: false, message: 'Plan not found' });
                }
                const renewFrom = subscription.endDate > new Date() ? subscription.endDate : new Date();
                calculatedEndDate = computeEndDate(renewFrom, plan.duration, plan.durationValue);
                renewalPlanId = plan._id as mongoose.Types.ObjectId;
                subscription.planId = renewalPlanId;
            } else {
                // Renew using the existing plan
                const plan = await MembershipPlan.findById(subscription.planId);
                if (!plan) {
                    return res.status(404).json({ success: false, message: 'Plan not found for renewal' });
                }
                const renewFrom = subscription.endDate > new Date() ? subscription.endDate : new Date();
                calculatedEndDate = computeEndDate(renewFrom, plan.duration, plan.durationValue);
            }

            subscription.renewalHistory.push({
                renewedAt: new Date(),
                previousEndDate,
                newEndDate: calculatedEndDate,
                amount: subscription.pricing.totalAmount,
            });

            subscription.endDate = calculatedEndDate;
            subscription.status = 'active';
            await subscription.save();

            // Update member expiry
            await Member.findByIdAndUpdate(subscription.memberId, {
                membershipExpiry: calculatedEndDate,
                planId: renewalPlanId,
                status: 'active',
            });

            await SubscriptionHistory.create({
                tenantId,
                memberId: subscription.memberId,
                subscriptionId: subscription._id,
                action: 'renewed',
                newPlanId: renewalPlanId,
                performedBy: req.user!._id,
                notes: 'Subscription renewed',
                metadata: { previousEndDate, newEndDate: calculatedEndDate },
            });

            return res.json({ success: true, message: 'Subscription renewed', data: subscription });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}

export default new SubscriptionController();
