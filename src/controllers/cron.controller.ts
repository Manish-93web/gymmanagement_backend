import { Request, Response } from 'express';
import Subscription from '../models/Subscription.model';
import Member from '../models/Member.model';
import SubscriptionHistory from '../models/SubscriptionHistory.model';
import mongoose from 'mongoose';

export class CronController {

    async processRenewals(req: Request, res: Response) {
        try {
            const now = new Date();
            // Find subscriptions that expired in the last 24 hours with autoRenew=true
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const expiredAutoRenew = await Subscription.find({
                status: 'active',
                endDate: { $gte: yesterday, $lte: now },
                autoRenew: true
            }).populate('planId');

            let renewed = 0, failed = 0;
            for (const sub of expiredAutoRenew) {
                try {
                    const plan = sub.planId as any;
                    const newEndDate = new Date(sub.endDate);
                    newEndDate.setMonth(newEndDate.getMonth() + (plan?.durationMonths || 1));
                    await Subscription.findByIdAndUpdate(sub._id, {
                        endDate: newEndDate, status: 'active'
                    });
                    await (SubscriptionHistory as any).create({
                        tenantId: sub.tenantId, memberId: sub.memberId,
                        subscriptionId: sub._id, action: 'renewed',
                        performedBy: new mongoose.Types.ObjectId(), notes: 'Auto-renewal'
                    });
                    renewed++;
                } catch { failed++; }
            }

            // Mark expired subscriptions
            const expired = await Subscription.updateMany(
                { status: 'active', endDate: { $lt: now }, autoRenew: false },
                { status: 'expired' }
            );

            // Update member statuses for expired subscriptions
            const expiredSubs = await Subscription.find({ status: 'expired', endDate: { $gte: yesterday, $lt: now } });
            for (const sub of expiredSubs) {
                await Member.findByIdAndUpdate(sub.memberId, { status: 'expired' });
            }

            return res.json({
                success: true,
                message: 'Renewal processing complete',
                data: { renewed, failed, expired: expired.modifiedCount }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error processing renewals', error: (error as Error).message });
        }
    }

    async processTrials(req: Request, res: Response) {
        try {
            const now = new Date();
            // Find tenants where trial has ended
            const Tenant = (await import('../models/Tenant.model')).default;
            const expiredTrials = await Tenant.find({
                'subscription.status': 'trial',
                trialEndsAt: { $lte: now }
            } as any);

            let updated = 0;
            for (const tenant of expiredTrials) {
                await Tenant.findByIdAndUpdate(tenant._id, {
                    'subscription.status': 'trial_expired'
                });
                updated++;
            }

            // Warning: trials expiring in 3 days
            const warningDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            const expiringTrials = await Tenant.countDocuments({
                'subscription.status': 'trial',
                trialEndsAt: { $gte: now, $lte: warningDate }
            } as any);

            return res.json({
                success: true,
                message: 'Trial processing complete',
                data: { expired: updated, expiringSoon: expiringTrials }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error processing trials', error: (error as Error).message });
        }
    }
}

export default new CronController();
