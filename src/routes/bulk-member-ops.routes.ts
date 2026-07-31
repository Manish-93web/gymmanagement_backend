import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTenantOid(req: Request): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId((req as any).tenantId as string);
}

async function loadMember() {
    try {
        return (await import('../models/Member.model')).default;
    } catch {
        return null;
    }
}

async function loadSubscription() {
    try {
        return (await import('../models/Subscription.model')).default;
    } catch {
        return null;
    }
}

// ─── GET /expired-active ──────────────────────────────────────────────────────
// Members whose subscription has expired but Member.status is still 'active'
router.get('/expired-active', async (req: Request, res: Response) => {
    try {
        const tid = getTenantOid(req);
        const now = new Date();

        const Member = await loadMember();
        const Subscription = await loadSubscription();

        if (!Member || !Subscription) {
            res.status(500).json({ success: false, message: 'Models not available' });
            return;
        }

        // Find subscriptions that are expired (endDate < now, status active)
        const expiredSubs = await Subscription.find({
            tenantId: tid,
            status: 'active',
            endDate: { $lt: now },
        })
            .select('memberId endDate planId')
            .populate('memberId', 'firstName lastName email mobile membershipNumber status planId membershipExpiry')
            .populate('planId', 'name')
            .lean();

        // Filter to only include members still in 'active' status
        const result = expiredSubs
            .filter((sub: any) => sub.memberId && (sub.memberId as any).status === 'active')
            .map((sub: any) => {
                const member = sub.memberId as any;
                const daysOverdue = Math.floor((now.getTime() - new Date(sub.endDate).getTime()) / (1000 * 60 * 60 * 24));
                return {
                    memberId: member._id,
                    subscriptionId: sub._id,
                    firstName: member.firstName,
                    lastName: member.lastName,
                    email: member.email,
                    mobile: member.mobile,
                    membershipNumber: member.membershipNumber,
                    planName: (sub.planId as any)?.name ?? 'N/A',
                    expiryDate: sub.endDate,
                    daysOverdue,
                };
            });

        res.json({ success: true, data: result, total: result.length });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /shift-to-expired ───────────────────────────────────────────────────
// Bulk update Member.status to 'expired' for given memberIds
router.post('/shift-to-expired', async (req: Request, res: Response) => {
    try {
        const tid = getTenantOid(req);
        const { memberIds } = req.body as { memberIds: string[] };

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            res.status(400).json({ success: false, message: 'memberIds array is required' });
            return;
        }

        const Member = await loadMember();
        const Subscription = await loadSubscription();

        if (!Member || !Subscription) {
            res.status(500).json({ success: false, message: 'Models not available' });
            return;
        }

        const updated: string[] = [];
        const errors: { memberId: string; error: string }[] = [];

        for (const memberId of memberIds) {
            try {
                const oid = new mongoose.Types.ObjectId(memberId);

                // Update Member status
                const member = await Member.findOneAndUpdate(
                    { _id: oid, tenantId: tid },
                    {
                        $set: { status: 'expired' },
                        $push: {
                            statusHistory: {
                                status: 'expired',
                                changedAt: new Date(),
                                changedBy: (req as any).user?._id ?? (req as any).user?.id,
                                reason: 'Bulk shift to expired — subscription end date passed',
                            },
                        },
                    },
                    { new: true }
                );

                if (member) {
                    // Also expire active subscriptions for this member
                    await Subscription.updateMany(
                        { tenantId: tid, memberId: oid, status: 'active' },
                        { $set: { status: 'expired' } }
                    );
                    updated.push(memberId);
                } else {
                    errors.push({ memberId, error: 'Member not found or not in this tenant' });
                }
            } catch (memberErr: any) {
                errors.push({ memberId, error: memberErr.message });
            }
        }

        res.json({ success: true, data: { updated: updated.length, updatedIds: updated, errors } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /shift-all-expired ──────────────────────────────────────────────────
// Auto-detect all expired-active members and shift them all
router.post('/shift-all-expired', async (req: Request, res: Response) => {
    try {
        const tid = getTenantOid(req);
        const now = new Date();

        const Member = await loadMember();
        const Subscription = await loadSubscription();

        if (!Member || !Subscription) {
            res.status(500).json({ success: false, message: 'Models not available' });
            return;
        }

        // Find expired subscriptions that still have active member
        const expiredSubs = await Subscription.find({
            tenantId: tid,
            status: 'active',
            endDate: { $lt: now },
        })
            .select('memberId')
            .lean();

        const memberIdSet = new Set<string>();
        for (const sub of expiredSubs) {
            if (sub.memberId) memberIdSet.add(sub.memberId.toString());
        }

        const candidateIds = Array.from(memberIdSet);

        // Filter to members still 'active'
        const activeMembers = await Member.find({
            tenantId: tid,
            _id: { $in: candidateIds },
            status: 'active',
        }).select('_id').lean();

        const targetIds = activeMembers.map((m: any) => m._id);

        if (targetIds.length === 0) {
            res.json({ success: true, data: { updated: 0, message: 'No expired-active members found' } });
            return;
        }

        const changedBy = (req as any).user?._id ?? (req as any).user?.id;

        // Bulk update member status
        const memberUpdate = await Member.updateMany(
            { tenantId: tid, _id: { $in: targetIds }, status: 'active' },
            {
                $set: { status: 'expired' },
                $push: {
                    statusHistory: {
                        status: 'expired',
                        changedAt: new Date(),
                        changedBy: changedBy,
                        reason: 'Bulk shift-all to expired — subscription end date passed',
                    },
                },
            }
        );

        // Expire active subscriptions for these members
        await Subscription.updateMany(
            { tenantId: tid, memberId: { $in: targetIds }, status: 'active' },
            { $set: { status: 'expired' } }
        );

        res.json({
            success: true,
            data: {
                updated: memberUpdate.modifiedCount,
                message: `${memberUpdate.modifiedCount} members shifted to expired`,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /bulk-renewal-reminder ──────────────────────────────────────────────
// Send renewal reminder to selected members (WhatsApp / notification)
router.post('/bulk-renewal-reminder', async (req: Request, res: Response) => {
    try {
        const tid = getTenantOid(req);
        const { memberIds, message: customMessage } = req.body as {
            memberIds: string[];
            message?: string;
        };

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            res.status(400).json({ success: false, message: 'memberIds array is required' });
            return;
        }

        const Member = await loadMember();
        if (!Member) {
            res.status(500).json({ success: false, message: 'Member model not available' });
            return;
        }

        const members = await Member.find({
            tenantId: tid,
            _id: { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) },
        })
            .select('firstName lastName mobile email')
            .lean();

        const defaultMessage =
            customMessage ||
            'Dear {name}, your gym membership has expired. Please renew to continue enjoying our facilities. Contact us for details.';

        const sent: string[] = [];
        const failed: { memberId: string; error: string }[] = [];

        // Try to use WhatsApp service
        let whatsappService: any = null;
        try {
            const wsModule = await import('../services/whatsapp.service');
            whatsappService = wsModule.default;
        } catch {
            // WhatsApp service not available — fall through to log only
        }

        for (const member of members) {
            const memberId = (member as any)._id.toString();
            try {
                const name = `${(member as any).firstName} ${(member as any).lastName}`.trim();
                const personalizedMsg = defaultMessage.replace('{name}', name);

                if (whatsappService && (member as any).mobile) {
                    try {
                        await whatsappService.sendMessage({
                            to: (member as any).mobile,
                            message: personalizedMsg,
                        });
                    } catch (waErr: any) {
                        // Log failure but don't block — record as sent (logged)
                        console.warn(`[bulk-reminder] WhatsApp failed for ${memberId}: ${waErr.message}`);
                    }
                }

                // Log notification attempt
                try {
                    const Notification = (await import('../models/Notification.model')).default;
                    await Notification.create({
                        tenantId: tid,
                        userId: (member as any).userId,
                        title: 'Membership Renewal Reminder',
                        message: personalizedMsg,
                        type: 'renewal_reminder' as any,
                        isRead: false,
                    } as any);
                } catch {
                    // Notification model may not accept all fields — non-critical
                }

                sent.push(memberId);
            } catch (memberErr: any) {
                failed.push({ memberId, error: memberErr.message });
            }
        }

        res.json({
            success: true,
            data: {
                sent: sent.length,
                sentIds: sent,
                failed,
                totalRequested: memberIds.length,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /expired-stats ───────────────────────────────────────────────────────
router.get('/expired-stats', async (req: Request, res: Response) => {
    try {
        const tid = getTenantOid(req);
        const now = new Date();
        const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const Member = await loadMember();
        const Subscription = await loadSubscription();

        if (!Member || !Subscription) {
            res.status(500).json({ success: false, message: 'Models not available' });
            return;
        }

        // Expired-active: subscription expired but member still 'active'
        const expiredSubs = await Subscription.find({
            tenantId: tid,
            status: 'active',
            endDate: { $lt: now },
        })
            .select('memberId endDate')
            .lean();

        const expiredMemberIds = expiredSubs.map((s: any) => s.memberId?.toString()).filter(Boolean);

        const activeStillExpiredCount = await Member.countDocuments({
            tenantId: tid,
            _id: { $in: expiredMemberIds },
            status: 'active',
        });

        // Expired in last 7 days (subscription endDate in last 7 days)
        const expiredLast7Days = await Subscription.countDocuments({
            tenantId: tid,
            endDate: { $gte: last7, $lt: now },
        });

        // Expired in last 30 days
        const expiredLast30Days = await Subscription.countDocuments({
            tenantId: tid,
            endDate: { $gte: last30, $lt: now },
        });

        // Total members with 'expired' status (all time)
        const totalExpiredAllTime = await Member.countDocuments({
            tenantId: tid,
            status: 'expired',
        });

        res.json({
            success: true,
            data: {
                totalExpiredActive: activeStillExpiredCount,
                expiredLast30Days,
                expiredLast7Days,
                totalExpiredAllTime,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
