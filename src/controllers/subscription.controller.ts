import { Request, Response, NextFunction } from 'express';
import Subscription from '../models/Subscription.model';
import SubscriptionHistory from '../models/SubscriptionHistory.model';
import Member from '../models/Member.model';
import MembershipPlan from '../models/MembershipPlan.model';
import mongoose from 'mongoose';

export class SubscriptionController {

    async getSubscriptions(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { memberId, status, page = 1, limit = 20 } = req.query;
            const query: any = { tenantId };
            if (memberId) query.memberId = memberId;
            if (status) query.status = status;
            const skip = (Number(page) - 1) * Number(limit);
            const [subscriptions, total] = await Promise.all([
                Subscription.find(query)
                    .populate('memberId', 'firstName lastName memberCode')
                    .populate('planId', 'name durationMonths')
                    .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
                Subscription.countDocuments(query)
            ]);
            return res.json({ success: true, data: { subscriptions, total, page: Number(page) } });
        } catch (error) { return next(error); }
    }

    async createSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const branchId = req.user!.branchId;
            const { planId, memberId, startDate, endDate, pricing, ...rest } = req.body;

            // Resolve dates and pricing from the plan if not provided
            let resolvedStart = startDate ? new Date(startDate) : new Date();
            let resolvedEnd = endDate ? new Date(endDate) : null;
            let resolvedPricing = pricing;

            if (planId && (!resolvedEnd || !resolvedPricing)) {
                const plan = await MembershipPlan.findById(planId) as any;
                if (plan) {
                    if (!resolvedEnd) {
                        resolvedEnd = new Date(resolvedStart);
                        resolvedEnd.setMonth(resolvedEnd.getMonth() + (plan.durationMonths || 1));
                    }
                    if (!resolvedPricing) {
                        const base = plan.price || plan.pricing?.basePrice || 0;
                        resolvedPricing = { basePrice: base, totalAmount: base, taxAmount: 0 };
                    }
                }
            }

            const subscription = await Subscription.create({
                ...rest,
                tenantId,
                planId,
                memberId,
                branchId: branchId || rest.branchId,
                startDate: resolvedStart,
                endDate: resolvedEnd,
                pricing: resolvedPricing,
            });
            await SubscriptionHistory.create({
                tenantId, memberId: subscription.memberId,
                subscriptionId: subscription._id, action: 'created',
                newPlanId: subscription.planId, performedBy: req.user!._id
            });
            return res.status(201).json({ success: true, data: subscription });
        } catch (error) { return next(error); }
    }

    async getMemberSubscriptions(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { memberId } = req.params;
            const subscriptions = await Subscription.find({ tenantId, memberId })
                .populate('planId', 'name durationMonths price')
                .sort({ createdAt: -1 });
            return res.json({ success: true, data: subscriptions });
        } catch (error) { return next(error); }
    }

    async getSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const sub = await Subscription.findOne({ _id: req.params.id, tenantId })
                .populate('memberId', 'firstName lastName memberCode')
                .populate('planId');
            if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
            return res.json({ success: true, data: sub });
        } catch (error) { return next(error); }
    }

    async cancelSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { reason } = req.body;
            const sub = await Subscription.findOneAndUpdate(
                { _id: req.params.id, tenantId },
                { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason },
                { new: true }
            );
            if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
            await SubscriptionHistory.create({
                tenantId, memberId: sub.memberId, subscriptionId: sub._id,
                action: 'cancelled', performedBy: req.user!._id, notes: reason
            });
            await Member.findOneAndUpdate({ _id: sub.memberId, tenantId }, { status: 'expired' });
            return res.json({ success: true, message: 'Subscription cancelled', data: sub });
        } catch (error) { return next(error); }
    }

    async freezeSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { startDate, endDate, reason } = req.body;
            const sub = await Subscription.findOne({ _id: req.params.id, tenantId });
            if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
            const freezeDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
            const newEndDate = new Date(sub.endDate);
            newEndDate.setDate(newEndDate.getDate() + freezeDays);
            await Subscription.findByIdAndUpdate(req.params.id, {
                status: 'frozen',
                endDate: newEndDate,
                currentFreeze: { startDate, endDate, reason, approvedBy: req.user!._id },
                $push: { freezeHistory: { startDate, endDate, reason, approvedBy: req.user!._id, daysExtended: freezeDays } }
            });
            await SubscriptionHistory.create({
                tenantId, memberId: sub.memberId, subscriptionId: sub._id,
                action: 'frozen', performedBy: req.user!._id, notes: reason
            });
            await Member.findOneAndUpdate({ _id: sub.memberId, tenantId }, { status: 'frozen' });
            return res.json({ success: true, message: 'Subscription frozen' });
        } catch (error) { return next(error); }
    }

    async unfreezeSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const sub = await Subscription.findOneAndUpdate(
                { _id: req.params.id, tenantId, status: 'frozen' },
                { status: 'active', $unset: { currentFreeze: 1 } },
                { new: true }
            );
            if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found or not frozen' });
            await SubscriptionHistory.create({
                tenantId, memberId: sub.memberId, subscriptionId: sub._id,
                action: 'unfrozen', performedBy: req.user!._id
            });
            await Member.findOneAndUpdate({ _id: sub.memberId, tenantId }, { status: 'active' });
            return res.json({ success: true, message: 'Subscription unfrozen', data: sub });
        } catch (error) { return next(error); }
    }

    async renewSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const sub = await Subscription.findOne({ _id: req.params.id, tenantId }).populate('planId');
            if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
            const plan = sub.planId as any;
            const newStartDate = new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date();
            const newEndDate = new Date(newStartDate);
            newEndDate.setMonth(newEndDate.getMonth() + (plan.durationMonths || 1));
            const updated = await Subscription.findByIdAndUpdate(req.params.id, {
                status: 'active', startDate: newStartDate, endDate: newEndDate
            }, { new: true });
            await SubscriptionHistory.create({
                tenantId, memberId: sub.memberId, subscriptionId: sub._id,
                action: 'renewed', performedBy: req.user!._id
            });
            await Member.findOneAndUpdate({ _id: sub.memberId, tenantId }, { status: 'active' });
            return res.json({ success: true, message: 'Subscription renewed', data: updated });
        } catch (error) { return next(error); }
    }

    async getSubscriptionStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const tenantObjId = new mongoose.Types.ObjectId(tenantId?.toString());
            const [statusCounts, expiringSoon] = await Promise.all([
                Subscription.aggregate([
                    { $match: { tenantId: tenantObjId } },
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ]),
                Subscription.countDocuments({
                    tenantId, status: 'active',
                    endDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
                })
            ]);
            const stats = { total: 0, active: 0, frozen: 0, cancelled: 0, expired: 0, paused: 0, expiringIn7Days: expiringSoon };
            statusCounts.forEach((s: any) => {
                stats[s._id as keyof typeof stats] = s.count;
                stats.total += s.count;
            });
            return res.json({ success: true, data: stats });
        } catch (error) { return next(error); }
    }

    async getSubscriptionHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const history = await SubscriptionHistory.find({ tenantId, subscriptionId: req.params.id })
                .populate('performedBy', 'firstName lastName')
                .sort({ createdAt: -1 });
            return res.json({ success: true, data: history });
        } catch (error) { return next(error); }
    }
}

export default new SubscriptionController();
