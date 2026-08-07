import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import MembershipPlan from '../models/MembershipPlan.model';
import Subscription from '../models/Subscription.model';
import Member from '../models/Member.model';
import { getOwnMemberId } from '../utils/memberOwnership';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── Duration helpers ─────────────────────────────────────────────────────────

const DURATION_MAP: Record<number, string> = {
    1: 'monthly',
    3: 'quarterly',
    6: 'half_yearly',
    12: 'yearly',
};

function calcEndDate(startDate: Date, durationMonths: number): Date {
    const end = new Date(startDate);
    end.setMonth(end.getMonth() + durationMonths);
    return end;
}

// ─── GET / — list digital_only plans for this tenant (all auth roles) ─────────
router.get(
    '/',
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const plans = await MembershipPlan.find({
                tenantId,
                planCategory: 'digital_only',
                isActive: true,
            })
                .sort({ createdAt: -1 })
                .lean();

            // Count members on each plan (active subscriptions)
            const planIds = plans.map((p: any) => p._id);
            const enrollmentAgg = await Subscription.aggregate([
                {
                    $match: {
                        tenantId: new mongoose.Types.ObjectId(tenantId),
                        planId: { $in: planIds },
                        status: 'active',
                    },
                },
                { $group: { _id: '$planId', count: { $sum: 1 } } },
            ]);
            const enrollmentMap: Record<string, number> = {};
            enrollmentAgg.forEach((e: any) => {
                enrollmentMap[e._id.toString()] = e.count;
            });

            const result = plans.map((p: any) => ({
                ...p,
                activeMembers: enrollmentMap[p._id.toString()] ?? 0,
            }));

            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── GET /my-digital-status — member checks their own digital plan status ─────
router.get(
    '/my-digital-status',
    requireAnyRole('member'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const userId = (req as any).user?._id ?? (req as any).user?.id;

            // Find member record for this user
            const member = await Member.findOne({
                userId: new mongoose.Types.ObjectId(userId),
                tenantId,
            }).lean();

            if (!member) {
                res.json({ success: true, data: { isDigitalOnly: false, features: null } });
                return;
            }

            // Find active subscription
            const sub = await Subscription.findOne({
                memberId: (member as any)._id,
                tenantId,
                status: 'active',
            })
                .populate('planId', 'name planCategory features pricing duration durationValue')
                .lean();

            if (!sub) {
                res.json({ success: true, data: { isDigitalOnly: false, features: null } });
                return;
            }

            const plan: any = (sub as any).planId;
            const isDigitalOnly = plan?.planCategory === 'digital_only';

            res.json({
                success: true,
                data: {
                    isDigitalOnly,
                    features: isDigitalOnly ? plan?.features ?? null : null,
                    plan: isDigitalOnly
                        ? {
                              name: plan?.name,
                              planCategory: plan?.planCategory,
                              features: plan?.features,
                              pricing: plan?.pricing,
                              duration: plan?.duration,
                              durationValue: plan?.durationValue,
                          }
                        : null,
                    subscription: isDigitalOnly
                        ? {
                              _id: (sub as any)._id,
                              status: (sub as any).status,
                              startDate: (sub as any).startDate,
                              endDate: (sub as any).endDate,
                          }
                        : null,
                },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── POST /check-in-guard — attendance system verifies check-in eligibility ───
router.post(
    '/check-in-guard',
    requireAnyRole('gym_owner', 'branch_manager', 'staff_reception', 'staff', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const { memberId, subscriptionId } = req.body;

            if (!memberId) {
                res.status(400).json({ success: false, message: 'memberId is required' });
                return;
            }

            // Find active subscription
            let query: Record<string, any> = {
                memberId: new mongoose.Types.ObjectId(memberId),
                tenantId,
                status: 'active',
            };
            if (subscriptionId) {
                query._id = new mongoose.Types.ObjectId(subscriptionId);
            }

            const sub = await Subscription.findOne(query)
                .populate('planId', 'planCategory name')
                .lean();

            if (!sub) {
                res.json({
                    success: true,
                    data: { allowed: true, reason: null },
                });
                return;
            }

            const plan: any = (sub as any).planId;
            if (plan?.planCategory === 'digital_only') {
                res.json({
                    success: true,
                    data: {
                        allowed: false,
                        reason: 'Digital-only membership — gym check-in not included. Upgrade to Full Membership.',
                    },
                });
                return;
            }

            res.json({ success: true, data: { allowed: true, reason: null } });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── POST / — create a new digital_only plan ──────────────────────────────────
router.post(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const { name, price, durationMonths, features } = req.body;

            if (!name || price == null || !durationMonths) {
                res.status(400).json({
                    success: false,
                    message: 'name, price, and durationMonths are required',
                });
                return;
            }

            const dm = Number(durationMonths);
            const duration = (DURATION_MAP[dm] ?? 'monthly') as any;

            const plan = new MembershipPlan({
                tenantId,
                name,
                type: 'time_based',
                duration,
                durationValue: dm,
                planCategory: 'digital_only',
                pricing: {
                    basePrice: Number(price),
                    taxRate: 0,
                    discountPercent: 0,
                    finalPrice: Number(price),
                },
                features: {
                    gymAccess: false,
                    groupClasses: false,
                    personalTraining: false,
                    onlineClasses: features?.onlineClasses ?? true,
                    dietPlan: features?.dietPlan ?? true,
                    lockerFacility: false,
                    freezeAllowed: false,
                    branchTransferAllowed: false,
                    videoLibrary: features?.videoLibrary ?? true,
                    wearableSync: features?.wearableSync ?? false,
                    healthCalculators: features?.healthCalculators ?? true,
                },
                isActive: true,
            });

            await plan.save();

            res.status(201).json({ success: true, data: plan });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── POST /enroll/:planId — enroll a member in a digital wellness plan ─────────
router.post(
    '/enroll/:planId',
    requireAnyRole('gym_owner', 'branch_manager', 'staff_reception', 'super_admin', 'member'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const planId = req.params.planId as string;

            // A 'member' caller can only ever enroll themselves — never trust a
            // client-supplied memberId for that role, or any member could enroll
            // (and bill) an arbitrary other member's account.
            let memberId = req.body.memberId;
            if ((req as any).user?.role === 'member') {
                const ownMemberId = await getOwnMemberId(req);
                if (!ownMemberId) {
                    res.status(403).json({ success: false, message: 'No linked member record' });
                    return;
                }
                memberId = ownMemberId;
            }

            if (!memberId) {
                res.status(400).json({ success: false, message: 'memberId is required' });
                return;
            }

            // Validate plan exists and is digital_only
            const plan = await MembershipPlan.findOne({
                _id: planId,
                tenantId,
                planCategory: 'digital_only',
                isActive: true,
            }).lean();

            if (!plan) {
                res.status(404).json({
                    success: false,
                    message: 'Digital wellness plan not found or inactive',
                });
                return;
            }

            // Validate member exists
            const member = await Member.findOne({
                _id: new mongoose.Types.ObjectId(memberId),
                tenantId,
            }).lean();

            if (!member) {
                res.status(404).json({ success: false, message: 'Member not found' });
                return;
            }

            // Check for existing active subscription on this plan
            const existingSub = await Subscription.findOne({
                memberId: new mongoose.Types.ObjectId(memberId),
                planId: new mongoose.Types.ObjectId(planId),
                tenantId,
                status: 'active',
            }).lean();

            if (existingSub) {
                res.status(400).json({
                    success: false,
                    message: 'Member already has an active subscription to this plan',
                });
                return;
            }

            const startDate = new Date();
            const endDate = calcEndDate(startDate, (plan as any).durationValue ?? 1);

            const sub = new Subscription({
                tenantId,
                branchId: (member as any).branchId ?? new mongoose.Types.ObjectId(),
                memberId: new mongoose.Types.ObjectId(memberId),
                planId: new mongoose.Types.ObjectId(planId),
                status: 'active',
                startDate,
                endDate,
                autoRenew: false,
                pricing: {
                    basePrice: (plan as any).pricing?.finalPrice ?? 0,
                    taxAmount: 0,
                    discountAmount: 0,
                    addOnsTotal: 0,
                    totalAmount: (plan as any).pricing?.finalPrice ?? 0,
                },
                addOns: [],
                freezeHistory: [],
                renewalHistory: [],
                notes: 'Digital wellness plan enrollment',
            });

            await sub.save();

            // Increment plan's currentMembers
            await MembershipPlan.updateOne(
                { _id: planId },
                { $inc: { currentMembers: 1 } }
            );

            res.status(201).json({ success: true, data: sub });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── PUT /:id — update a digital wellness plan ────────────────────────────────
router.put(
    '/:id',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;
            const { name, price, durationMonths, features } = req.body;

            const plan = await MembershipPlan.findOne({
                _id: req.params.id,
                tenantId,
                planCategory: 'digital_only',
            });

            if (!plan) {
                res.status(404).json({ success: false, message: 'Digital wellness plan not found' });
                return;
            }

            if (name) (plan as any).name = name;
            if (price != null) {
                (plan as any).pricing.basePrice = Number(price);
                (plan as any).pricing.finalPrice = Number(price);
            }
            if (durationMonths) {
                const dm = Number(durationMonths);
                (plan as any).durationValue = dm;
                (plan as any).duration = DURATION_MAP[dm] ?? 'monthly';
            }
            if (features) {
                if (features.dietPlan != null)         (plan as any).features.dietPlan = features.dietPlan;
                if (features.onlineClasses != null)    (plan as any).features.onlineClasses = features.onlineClasses;
                if (features.videoLibrary != null)     (plan as any).features.videoLibrary = features.videoLibrary;
                if (features.wearableSync != null)     (plan as any).features.wearableSync = features.wearableSync;
                if (features.healthCalculators != null)(plan as any).features.healthCalculators = features.healthCalculators;
                // Digital plans never get gym access or group classes
                (plan as any).features.gymAccess = false;
                (plan as any).features.groupClasses = false;
            }

            await (plan as any).save();
            res.json({ success: true, data: plan });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── DELETE /:id — deactivate a digital wellness plan ────────────────────────
router.delete(
    '/:id',
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId;

            const plan = await MembershipPlan.findOne({
                _id: req.params.id,
                tenantId,
                planCategory: 'digital_only',
            });

            if (!plan) {
                res.status(404).json({ success: false, message: 'Digital wellness plan not found' });
                return;
            }

            (plan as any).isActive = false;
            await (plan as any).save();

            res.json({ success: true, message: 'Plan deactivated successfully' });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

export default router;
