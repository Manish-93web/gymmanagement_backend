import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import RefundPolicy from '../models/RefundPolicy.model';

const router = Router();

// ─── Public endpoint — no auth ────────────────────────────────────────────────
// GET /refund-policy/public?tenantId=xxx
router.get('/public', async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.query as { tenantId?: string };
        if (!tenantId) {
            res.status(400).json({ success: false, message: 'tenantId query param required' });
            return;
        }

        const policy = await RefundPolicy.findOne({ tenantId }).lean();
        if (!policy || !(policy as any).isEnabled) {
            res.json({ success: true, data: null, message: 'No refund policy configured' });
            return;
        }

        // Return only public-facing data
        res.json({
            success: true,
            data: {
                isEnabled: (policy as any).isEnabled,
                tiers: (policy as any).tiers,
                afterMaxDayRefundPercent: (policy as any).afterMaxDayRefundPercent,
                processingFee: (policy as any).processingFee,
                processingFeeType: (policy as any).processingFeeType,
                notes: (policy as any).notes,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Protected routes ─────────────────────────────────────────────────────────
router.use(authenticate);
router.use(tenantContext);

// GET / — get (or create default) refund policy for this tenant
router.get('/', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId as string;
        if (!tenantId) {
            res.status(400).json({ success: false, message: 'Tenant context missing' });
            return;
        }

        // Upsert default policy if none exists
        let policy = await RefundPolicy.findOne({ tenantId });
        if (!policy) {
            policy = await RefundPolicy.create({
                tenantId,
                isEnabled: true,
                processingFee: 750,
                processingFeeType: 'flat',
                requiresApproval: false,
                tiers: [
                    { fromDay: 1,  toDay: 30, refundPercent: 100 },
                    { fromDay: 31, toDay: 60, refundPercent: 50  },
                    { fromDay: 61, toDay: 90, refundPercent: 25  },
                ],
                afterMaxDayRefundPercent: 0,
                nonRefundablePlanIds: [],
            });
        }

        res.json({ success: true, data: policy });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT / — save / update refund policy
router.put('/', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId as string;
        if (!tenantId) {
            res.status(400).json({ success: false, message: 'Tenant context missing' });
            return;
        }

        const {
            isEnabled,
            processingFee,
            processingFeeType,
            tiers,
            afterMaxDayRefundPercent,
            nonRefundablePlanIds,
            requiresApproval,
            notes,
        } = req.body;

        const policy = await RefundPolicy.findOneAndUpdate(
            { tenantId },
            {
                $set: {
                    ...(isEnabled !== undefined && { isEnabled }),
                    ...(processingFee !== undefined && { processingFee: Number(processingFee) }),
                    ...(processingFeeType !== undefined && { processingFeeType }),
                    ...(tiers !== undefined && { tiers }),
                    ...(afterMaxDayRefundPercent !== undefined && { afterMaxDayRefundPercent: Number(afterMaxDayRefundPercent) }),
                    ...(nonRefundablePlanIds !== undefined && { nonRefundablePlanIds }),
                    ...(requiresApproval !== undefined && { requiresApproval }),
                    ...(notes !== undefined && { notes }),
                },
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.json({ success: true, data: policy });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /calculate — calculate refund amount for given purchase date and amount
router.post('/calculate', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId as string;
        const { purchaseDate, amount } = req.body as { purchaseDate: string; amount: number };

        if (!purchaseDate || amount === undefined || amount === null) {
            res.status(400).json({ success: false, message: 'purchaseDate and amount are required' });
            return;
        }

        const parsedDate = new Date(purchaseDate);
        if (isNaN(parsedDate.getTime())) {
            res.status(400).json({ success: false, message: 'Invalid purchaseDate' });
            return;
        }

        const parsedAmount = Number(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
            return;
        }

        // Get or create policy
        let policy = await RefundPolicy.findOne({ tenantId }).lean();
        if (!policy) {
            // Default policy for calculation
            policy = {
                tenantId,
                isEnabled: true,
                processingFee: 750,
                processingFeeType: 'flat',
                tiers: [
                    { fromDay: 1,  toDay: 30, refundPercent: 100 },
                    { fromDay: 31, toDay: 60, refundPercent: 50  },
                    { fromDay: 61, toDay: 90, refundPercent: 25  },
                ],
                afterMaxDayRefundPercent: 0,
                nonRefundablePlanIds: [],
                requiresApproval: false,
            } as any;
        }

        const now = new Date();
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysSincePurchase = Math.floor((now.getTime() - parsedDate.getTime()) / msPerDay) + 1;

        // Run calculation using static method pattern
        const p = policy as any;
        const sortedTiers = [...(p.tiers || [])].sort((a: any, b: any) => a.fromDay - b.fromDay);
        let matchedTier: any = null;
        let eligiblePercent: number = p.afterMaxDayRefundPercent ?? 0;

        if (p.isEnabled) {
            for (const tier of sortedTiers) {
                if (daysSincePurchase >= tier.fromDay && daysSincePurchase <= tier.toDay) {
                    matchedTier = tier;
                    eligiblePercent = tier.refundPercent;
                    break;
                }
            }
        } else {
            eligiblePercent = 0;
        }

        const grossRefund = (parsedAmount * eligiblePercent) / 100;
        let processingFeeDeducted = 0;
        if (p.processingFeeType === 'flat') {
            processingFeeDeducted = Math.min(p.processingFee ?? 750, grossRefund);
        } else {
            processingFeeDeducted = (grossRefund * (p.processingFee ?? 0)) / 100;
        }
        const netRefund = Math.max(0, grossRefund - processingFeeDeducted);

        res.json({
            success: true,
            data: {
                daysSincePurchase,
                eligiblePercent,
                tier: matchedTier
                    ? { fromDay: matchedTier.fromDay, toDay: matchedTier.toDay, refundPercent: matchedTier.refundPercent }
                    : null,
                grossRefund: Math.round(grossRefund * 100) / 100,
                processingFeeDeducted: Math.round(processingFeeDeducted * 100) / 100,
                refundAmount: Math.round(netRefund * 100) / 100,
                originalAmount: parsedAmount,
                isEligible: eligiblePercent > 0,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
