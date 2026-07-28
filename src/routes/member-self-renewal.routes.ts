import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── Helper: resolve member record for the authenticated user ─────────────────
async function resolveCurrentMember(req: Request) {
    const Member = require('../models/Member.model').default;
    const userId = (req as any).user?._id ?? (req as any).user?.id;
    const tenantId = req.tenantId;
    const member = await Member.findOne({ userId, tenantId }).lean();
    return member as any | null;
}

// ─── GET /my-membership ────────────────────────────────────────────────────────
router.get('/my-membership', async (req: Request, res: Response) => {
    try {
        const Subscription   = require('../models/Subscription.model').default;
        const MembershipPlan = require('../models/MembershipPlan.model').default;

        const member = await resolveCurrentMember(req);
        if (!member) {
            res.json({ success: true, data: { hasSubscription: false, message: 'No member profile found for this account.' } });
            return;
        }

        // Get the most relevant subscription: active first, then latest
        const subscription = await Subscription.findOne({
            memberId: member._id,
            tenantId: req.tenantId,
        })
            .sort({ status: 1, endDate: -1 }) // active < expired alphabetically
            .populate('planId', 'name pricing duration durationValue')
            .lean() as any;

        if (!subscription) {
            res.json({
                success: true,
                data: {
                    hasSubscription: false,
                    message: 'No membership found. Please contact your gym to enroll.',
                },
            });
            return;
        }

        const now          = new Date();
        const endDate      = new Date(subscription.endDate);
        const msRemaining  = endDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / 86_400_000);
        const isExpired     = daysRemaining <= 0;
        const isExpiringSoon = !isExpired && daysRemaining <= 30;

        const plan         = subscription.planId as any;
        const price        = plan?.pricing?.finalPrice ?? plan?.pricing?.basePrice ?? 0;

        res.json({
            success: true,
            data: {
                hasSubscription:  true,
                subscriptionId:   subscription._id,
                planId:           plan?._id,
                planName:         plan?.name ?? 'Membership',
                startDate:        subscription.startDate,
                endDate:          subscription.endDate,
                daysRemaining:    Math.max(daysRemaining, 0),
                price,
                status:           subscription.status,
                isExpired,
                isExpiringSoon,
                memberName: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim(),
                memberId:   member._id,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /available-plans ─────────────────────────────────────────────────────
router.get('/available-plans', async (req: Request, res: Response) => {
    try {
        const MembershipPlan = require('../models/MembershipPlan.model').default;
        const tenantId       = req.tenantId;

        const plans = await MembershipPlan.find({
            tenantId,
            isActive: true,
        })
            .select('name description type duration durationValue pricing features isFamilyPlan')
            .sort({ 'pricing.finalPrice': 1 })
            .lean() as any[];

        const formatted = plans.map((p: any) => ({
            planId:        p._id,
            name:          p.name,
            description:   p.description ?? '',
            type:          p.type,
            duration:      p.duration,
            durationValue: p.durationValue,
            price:         p.pricing?.finalPrice ?? p.pricing?.basePrice ?? 0,
            basePrice:     p.pricing?.basePrice ?? 0,
            taxRate:       p.pricing?.taxRate ?? 0,
            discountPercent: p.pricing?.discountPercent ?? 0,
            features:      p.features ?? {},
            isFamilyPlan:  p.isFamilyPlan ?? false,
        }));

        res.json({ success: true, data: formatted });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /initiate-payment ────────────────────────────────────────────────────
router.post('/initiate-payment', async (req: Request, res: Response) => {
    try {
        const MembershipPlan = require('../models/MembershipPlan.model').default;
        const { planId, couponCode } = req.body as { planId: string; couponCode?: string };

        if (!planId) {
            res.status(400).json({ success: false, message: 'planId is required' });
            return;
        }

        const plan = await MembershipPlan.findOne({
            _id: planId,
            tenantId: req.tenantId,
            isActive: true,
        }).lean() as any;

        if (!plan) {
            res.status(404).json({ success: false, message: 'Plan not found or inactive' });
            return;
        }

        const member = await resolveCurrentMember(req);
        if (!member) {
            res.status(404).json({ success: false, message: 'Member profile not found' });
            return;
        }

        let finalPrice = plan.pricing?.finalPrice ?? plan.pricing?.basePrice ?? 0;

        // Basic coupon lookup (optional)
        let couponDiscount = 0;
        if (couponCode) {
            try {
                const Coupon = require('../models/Coupon.model').default;
                const coupon = await Coupon.findOne({
                    tenantId: req.tenantId,
                    code:     couponCode.toUpperCase(),
                    isActive: true,
                }).lean() as any;
                if (coupon) {
                    if (coupon.discountType === 'percent') {
                        couponDiscount = Math.round((finalPrice * coupon.discountValue) / 100);
                    } else {
                        couponDiscount = coupon.discountValue ?? 0;
                    }
                    finalPrice = Math.max(0, finalPrice - couponDiscount);
                }
            } catch {
                // Coupon model may not exist — ignore
            }
        }

        const memberName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();

        try {
            // Try Razorpay
            const Razorpay = require('razorpay');
            const razorpay = new Razorpay({
                key_id:     process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
            });
            const order = await razorpay.orders.create({
                amount:  Math.round(finalPrice * 100),
                currency: 'INR',
                receipt:  `renewal_${Date.now()}`,
                notes:    {
                    memberId: member._id.toString(),
                    planId:   plan._id.toString(),
                    tenantId: req.tenantId,
                },
            });
            res.json({
                success: true,
                data: {
                    orderId:    order.id,
                    amount:     finalPrice,
                    currency:   'INR',
                    gatewayKey: process.env.RAZORPAY_KEY_ID,
                    memberName,
                    planName:   plan.name,
                    couponDiscount,
                    isMock:     false,
                },
            });
        } catch {
            // Mock order for development / when Razorpay is not configured
            res.json({
                success: true,
                data: {
                    orderId:    `mock_${Date.now()}`,
                    amount:     finalPrice,
                    currency:   'INR',
                    gatewayKey: 'test',
                    memberName,
                    planName:   plan.name,
                    couponDiscount,
                    isMock:     true,
                },
            });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /confirm-renewal ────────────────────────────────────────────────────
router.post('/confirm-renewal', async (req: Request, res: Response) => {
    try {
        const Subscription   = require('../models/Subscription.model').default;
        const MembershipPlan = require('../models/MembershipPlan.model').default;
        const Payment        = require('../models/Payment.model').default;

        const {
            orderId,
            paymentId,
            planId,
            razorpaySignature,
            isMock,
        } = req.body as {
            orderId:            string;
            paymentId:          string;
            planId:             string;
            razorpaySignature?: string;
            isMock?:            boolean;
        };

        if (!orderId || !planId) {
            res.status(400).json({ success: false, message: 'orderId and planId are required' });
            return;
        }

        // Verify Razorpay HMAC signature when not a mock payment
        if (!isMock && razorpaySignature && process.env.RAZORPAY_KEY_SECRET) {
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${orderId}|${paymentId}`)
                .digest('hex');
            if (expectedSignature !== razorpaySignature) {
                res.status(400).json({ success: false, message: 'Payment signature verification failed' });
                return;
            }
        }

        const member = await resolveCurrentMember(req);
        if (!member) {
            res.status(404).json({ success: false, message: 'Member profile not found' });
            return;
        }

        const plan = await MembershipPlan.findOne({
            _id: planId,
            tenantId: req.tenantId,
            isActive: true,
        }).lean() as any;

        if (!plan) {
            res.status(404).json({ success: false, message: 'Plan not found' });
            return;
        }

        // Determine start/end dates
        const now = new Date();

        // If there is an active subscription that hasn't expired yet, chain from its endDate
        const currentSub = await Subscription.findOne({
            memberId: member._id,
            tenantId: req.tenantId,
            status:   'active',
            endDate:  { $gt: now },
        })
            .sort({ endDate: -1 })
            .lean() as any;

        const startDate = currentSub ? new Date(currentSub.endDate) : now;

        // Calculate end date from plan duration
        const endDate = new Date(startDate);
        const durVal  = plan.durationValue ?? 1;
        switch (plan.duration) {
            case 'daily':       endDate.setDate(endDate.getDate() + durVal); break;
            case 'weekly':      endDate.setDate(endDate.getDate() + durVal * 7); break;
            case 'monthly':     endDate.setMonth(endDate.getMonth() + durVal); break;
            case 'quarterly':   endDate.setMonth(endDate.getMonth() + durVal * 3); break;
            case 'half_yearly': endDate.setMonth(endDate.getMonth() + durVal * 6); break;
            case 'yearly':      endDate.setFullYear(endDate.getFullYear() + durVal); break;
            default:            endDate.setMonth(endDate.getMonth() + 1);
        }

        const finalPrice = plan.pricing?.finalPrice ?? plan.pricing?.basePrice ?? 0;

        // Create new subscription
        const branchId = member.branchId ?? (req as any).user?.branchId;
        const newSubscription = await Subscription.create({
            tenantId:  req.tenantId,
            branchId,
            memberId:  member._id,
            planId:    plan._id,
            status:    'active',
            startDate,
            endDate,
            autoRenew: false,
            pricing: {
                basePrice:      plan.pricing?.basePrice ?? finalPrice,
                taxAmount:      0,
                discountAmount: 0,
                addOnsTotal:    0,
                totalAmount:    finalPrice,
            },
            addOns:          [],
            freezeHistory:   [],
            renewalHistory:  [],
            notes: `Self-renewed online. Payment: ${isMock ? 'mock' : 'razorpay'} | Order: ${orderId}`,
        });

        // Generate a simple invoice number
        const invoiceNumber = `INV-RENEW-${Date.now().toString(36).toUpperCase()}`;

        // Create payment record
        const payment = await Payment.create({
            tenantId:      req.tenantId,
            branchId,
            memberId:      member._id,
            subscriptionId: newSubscription._id,
            planId:         plan._id,
            invoiceNumber,
            type:           'renewal',
            paymentType:    'renewal',
            method:         isMock ? 'upi' : 'razorpay',
            status:         'completed',
            paidAt:         new Date(),
            amount: {
                subtotal:       finalPrice,
                taxAmount:      0,
                discountAmount: 0,
                total:          finalPrice,
            },
            taxDetails: {
                taxType: 'NONE',
                taxRate:  0,
            },
            gateway: isMock ? undefined : {
                provider:   'razorpay',
                transactionId: paymentId ?? orderId,
                orderId,
                paymentId:  paymentId ?? '',
                signature:  razorpaySignature ?? '',
            },
            invoice: { generated: false, emailSent: false },
            metadata: {
                description: `Membership renewal — ${plan.name}`,
                items: [{
                    name:     plan.name,
                    quantity: 1,
                    price:    finalPrice,
                    total:    finalPrice,
                }],
            },
            notes: `Self-service online renewal`,
        });

        // Send WhatsApp notification (best-effort, non-blocking)
        try {
            const whatsappService = require('../services/whatsapp.service').default;
            if (whatsappService && member.mobile) {
                const formattedEnd = endDate.toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'long', year: 'numeric',
                });
                await whatsappService.sendMessage({
                    tenantId: req.tenantId,
                    to:       member.mobile,
                    message:  `Hi ${member.firstName ?? 'Member'}, your membership has been renewed successfully! ` +
                              `Plan: ${plan.name}. Valid until: ${formattedEnd}. Thank you!`,
                });
            }
        } catch {
            // Notification failure is non-fatal
        }

        res.json({
            success:   true,
            data: {
                message:        'Membership renewed successfully!',
                newEndDate:     endDate,
                newStartDate:   startDate,
                planName:       plan.name,
                invoiceId:      payment._id,
                invoiceNumber,
                subscriptionId: newSubscription._id,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /renewal-history ─────────────────────────────────────────────────────
router.get('/renewal-history', async (req: Request, res: Response) => {
    try {
        const Subscription = require('../models/Subscription.model').default;

        const member = await resolveCurrentMember(req);
        if (!member) {
            res.status(404).json({ success: false, message: 'Member profile not found' });
            return;
        }

        const history = await Subscription.find({
            memberId: member._id,
            tenantId: req.tenantId,
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('planId', 'name duration durationValue pricing')
            .lean() as any[];

        const formatted = history.map((s: any) => ({
            subscriptionId: s._id,
            planName:       s.planId?.name ?? 'Membership',
            startDate:      s.startDate,
            endDate:        s.endDate,
            status:         s.status,
            amount:         s.pricing?.totalAmount ?? 0,
            createdAt:      s.createdAt,
        }));

        res.json({ success: true, data: formatted });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
