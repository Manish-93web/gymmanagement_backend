import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import MembershipTransfer from '../models/MembershipTransfer.model';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── GET / — list all transfers for tenant ────────────────────────────────────
router.get(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'staff_reception', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const page = parseInt((req.query.page as string) ?? '1', 10);
            const limit = parseInt((req.query.limit as string) ?? '20', 10);
            const skip = (page - 1) * limit;
            const statusFilter = req.query.status as string | undefined;

            const filter: Record<string, any> = { tenantId };
            if (statusFilter) filter.status = statusFilter;

            const [transfers, total] = await Promise.all([
                MembershipTransfer.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('fromMemberId', 'firstName lastName mobile')
                    .populate('toMemberId', 'firstName lastName mobile')
                    .populate('subscriptionId', 'planId startDate endDate status sessions')
                    .lean(),
                MembershipTransfer.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: transfers,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── POST /initiate ───────────────────────────────────────────────────────────
router.post(
    '/initiate',
    requireAnyRole('gym_owner', 'branch_manager', 'staff_reception', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const {
                subscriptionId,
                fromMemberId,
                toMemberId,
                toMemberDetails,
                transferFee,
                reason,
                notes,
            } = req.body;

            if (!subscriptionId || !fromMemberId) {
                res.status(400).json({ success: false, message: 'subscriptionId and fromMemberId are required' });
                return;
            }
            if (!toMemberId && !toMemberDetails) {
                res.status(400).json({ success: false, message: 'Either toMemberId or toMemberDetails must be provided' });
                return;
            }

            // Validate subscription belongs to this tenant and is active
            const subscription = await Subscription.findOne({
                _id: subscriptionId,
                tenantId: new mongoose.Types.ObjectId(tenantId),
            }).lean();
            if (!subscription) {
                res.status(404).json({ success: false, message: 'Active subscription not found' });
                return;
            }
            if ((subscription as any).status !== 'active') {
                res.status(400).json({ success: false, message: `Subscription is ${(subscription as any).status}, only active subscriptions can be transferred` });
                return;
            }

            // Check no pending transfer already exists for this subscription
            const existing = await MembershipTransfer.findOne({
                subscriptionId,
                status: 'pending',
            }).lean();
            if (existing) {
                res.status(400).json({ success: false, message: 'A pending transfer already exists for this subscription' });
                return;
            }

            // Compute remaining days
            const now = new Date();
            const endDate = new Date((subscription as any).endDate);
            const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000));

            // Compute remaining sessions
            const remainingSessions = (subscription as any).sessions?.remainingSessions ?? undefined;

            const transfer = new MembershipTransfer({
                tenantId,
                branchId: (subscription as any).branchId?.toString(),
                subscriptionId,
                fromMemberId,
                toMemberId: toMemberId || undefined,
                toMemberDetails: toMemberDetails || undefined,
                transferFee: transferFee ?? 0,
                reason,
                status: 'pending',
                remainingDays,
                remainingSessions,
                notes,
            });

            await transfer.save();

            res.status(201).json({ success: true, data: transfer });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────
router.put(
    '/:id/approve',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const actingUserId = (req as any).user?._id ?? (req as any).user?.id;

            const transfer = await MembershipTransfer.findOne({
                _id: req.params.id,
                tenantId,
            });
            if (!transfer) {
                res.status(404).json({ success: false, message: 'Transfer not found' });
                return;
            }
            if ((transfer as any).status !== 'pending') {
                res.status(400).json({ success: false, message: `Transfer is already ${(transfer as any).status}` });
                return;
            }

            // Find original subscription
            const originalSub = await Subscription.findById((transfer as any).subscriptionId);
            if (!originalSub) {
                res.status(404).json({ success: false, message: 'Original subscription not found' });
                return;
            }

            // Determine recipient member ID
            let recipientMemberId: mongoose.Types.ObjectId;

            if ((transfer as any).toMemberId) {
                recipientMemberId = (transfer as any).toMemberId;
                // Verify member exists
                const recipientMember = await Member.findById(recipientMemberId).lean();
                if (!recipientMember) {
                    res.status(404).json({ success: false, message: 'Recipient member not found' });
                    return;
                }
            } else if ((transfer as any).toMemberDetails) {
                const details = (transfer as any).toMemberDetails;
                // Generate a unique membership number
                const count = await Member.countDocuments({ tenantId });
                const membershipNumber = `TRF-${Date.now()}-${count + 1}`;

                const newMember = new Member({
                    tenantId,
                    branchId: (originalSub as any).branchId,
                    firstName: details.firstName,
                    lastName: details.lastName,
                    email: details.email || `transferred_${Date.now()}@noemail.local`,
                    mobile: details.mobile || '',
                    membershipNumber,
                    status: 'active',
                    walletBalance: 0,
                    healthInfo: {
                        medicalConditions: [],
                        allergies: [],
                        medications: [],
                        injuries: [],
                        doctorClearance: false,
                    },
                });
                await newMember.save();
                recipientMemberId = newMember._id as mongoose.Types.ObjectId;

                // Update transfer with new member reference
                (transfer as any).toMemberId = recipientMemberId;
            } else {
                res.status(400).json({ success: false, message: 'No recipient member information provided' });
                return;
            }

            // Compute new endDate: use original endDate or today + remainingDays
            const now = new Date();
            let newEndDate: Date;
            if ((originalSub as any).endDate && new Date((originalSub as any).endDate) > now) {
                newEndDate = new Date((originalSub as any).endDate);
            } else {
                const remainingDays = (transfer as any).remainingDays ?? 0;
                newEndDate = new Date(now);
                newEndDate.setDate(newEndDate.getDate() + remainingDays);
            }

            // Create new subscription for recipient
            const newSubData: Record<string, any> = {
                tenantId: (originalSub as any).tenantId,
                branchId: (originalSub as any).branchId,
                memberId: recipientMemberId,
                planId: (originalSub as any).planId,
                status: 'active',
                startDate: now,
                endDate: newEndDate,
                autoRenew: false,
                pricing: (originalSub as any).pricing ?? {
                    basePrice: 0,
                    taxAmount: 0,
                    discountAmount: 0,
                    addOnsTotal: 0,
                    totalAmount: 0,
                },
                addOns: (originalSub as any).addOns ?? [],
                freezeHistory: [],
                renewalHistory: [],
                notes: `Transferred from subscription ${(originalSub as any)._id}`,
            };

            // Copy sessions if applicable
            const remainingSessions = (transfer as any).remainingSessions;
            if (remainingSessions !== undefined && remainingSessions !== null) {
                const totalSessions = (originalSub as any).sessions?.totalSessions ?? remainingSessions;
                newSubData.sessions = {
                    totalSessions,
                    usedSessions: 0,
                    remainingSessions,
                };
            }

            const newSubscription = new Subscription(newSubData);
            await newSubscription.save();

            // Deactivate original subscription
            (originalSub as any).status = 'cancelled';
            if (!(originalSub as any).cancellation) {
                (originalSub as any).cancellation = {};
            }
            (originalSub as any).cancellation.cancelledAt = now;
            (originalSub as any).cancellation.cancelledBy = actingUserId;
            (originalSub as any).cancellation.reason = `Transferred to member ${recipientMemberId}`;
            (originalSub as any).cancellation.refundAmount = 0;
            (originalSub as any).cancellation.refundStatus = 'rejected';
            await (originalSub as any).save();

            // Update transfer record
            (transfer as any).status = 'approved';
            (transfer as any).approvedBy = actingUserId;
            (transfer as any).approvedAt = now;
            await (transfer as any).save();

            res.json({
                success: true,
                data: {
                    transfer,
                    newSubscriptionId: newSubscription._id,
                },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────
router.put(
    '/:id/reject',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const actingUserId = (req as any).user?._id ?? (req as any).user?.id;
            const { rejectionReason } = req.body;

            const transfer = await MembershipTransfer.findOne({
                _id: req.params.id,
                tenantId,
            });
            if (!transfer) {
                res.status(404).json({ success: false, message: 'Transfer not found' });
                return;
            }
            if ((transfer as any).status !== 'pending') {
                res.status(400).json({ success: false, message: `Transfer is already ${(transfer as any).status}` });
                return;
            }

            (transfer as any).status = 'rejected';
            (transfer as any).rejectedBy = actingUserId;
            (transfer as any).rejectedAt = new Date();
            (transfer as any).rejectionReason = rejectionReason;
            await (transfer as any).save();

            res.json({ success: true, data: transfer });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── PUT /:id/cancel ──────────────────────────────────────────────────────────
router.put(
    '/:id/cancel',
    requireAnyRole('gym_owner', 'branch_manager', 'member', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;

            const transfer = await MembershipTransfer.findOne({
                _id: req.params.id,
                tenantId,
            });
            if (!transfer) {
                res.status(404).json({ success: false, message: 'Transfer not found' });
                return;
            }
            if ((transfer as any).status !== 'pending') {
                res.status(400).json({ success: false, message: 'Only pending transfers can be cancelled' });
                return;
            }

            (transfer as any).status = 'cancelled';
            await (transfer as any).save();

            res.json({ success: true, data: transfer });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── GET /member/:memberId — transfers involving a member ─────────────────────
router.get(
    '/member/:memberId',
    requireAnyRole('gym_owner', 'branch_manager', 'staff_reception', 'member', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const memberId = req.params.memberId as string;

            const transfers = await MembershipTransfer.find({
                tenantId: String(tenantId),
                $or: [
                    { fromMemberId: memberId },
                    { toMemberId: memberId },
                ],
            })
                .sort({ createdAt: -1 })
                .populate('fromMemberId', 'firstName lastName mobile')
                .populate('toMemberId', 'firstName lastName mobile')
                .populate('subscriptionId', 'planId startDate endDate status sessions')
                .lean();

            res.json({ success: true, data: transfers });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

export default router;
