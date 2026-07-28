import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import RefundRequest from '../models/RefundRequest.model';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTenantId(req: Request): string {
    return (req as any).tenantId as string;
}

function getUserId(req: Request): string {
    const user = (req as any).user;
    return user?._id?.toString() ?? user?.id?.toString() ?? 'system';
}

// ─── POST / — member submits a refund request ─────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const user = (req as any).user;
        const memberId = user?._id?.toString() ?? user?.id?.toString();
        const memberName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Member';

        const { subscriptionId, invoiceId, reason, reasonCategory, amount } = req.body;

        if (!reason || !reasonCategory || amount === undefined || amount === null) {
            res.status(400).json({
                success: false,
                message: 'reason, reasonCategory and amount are required',
            });
            return;
        }

        const parsedAmount = Number(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            res.status(400).json({ success: false, message: 'amount must be a positive number' });
            return;
        }

        // Auto-fetch purchaseDate from Subscription or Invoice
        let purchaseDate: Date | undefined;
        try {
            if (subscriptionId) {
                const Subscription = require('../models/Subscription.model').default;
                const sub = await Subscription.findOne({ _id: subscriptionId, tenantId }).lean();
                if (sub) purchaseDate = (sub as any).startDate ?? (sub as any).createdAt;
            } else if (invoiceId) {
                const InvoiceModel = require('../models/Invoice.model').default;
                const inv = await InvoiceModel.findOne({ _id: invoiceId, tenantId }).lean();
                if (inv) purchaseDate = (inv as any).createdAt ?? (inv as any).issuedAt;
            }
        } catch {
            // Non-critical — proceed without purchaseDate
        }

        // Auto-calculate refund using RefundPolicy
        let calculatedRefundAmount: number | undefined;
        let eligiblePercent: number | undefined;
        let processingFee: number | undefined;
        let netRefundAmount: number | undefined;

        try {
            const RefundPolicy = require('../models/RefundPolicy.model').default;
            const policy = await RefundPolicy.findOne({ tenantId });
            if (policy && policy.isEnabled && purchaseDate) {
                const now = new Date();
                const msPerDay = 1000 * 60 * 60 * 24;
                const daysSince = Math.floor((now.getTime() - purchaseDate.getTime()) / msPerDay) + 1;

                const sortedTiers = [...(policy.tiers || [])].sort(
                    (a: any, b: any) => a.fromDay - b.fromDay,
                );
                let matchedTier: any = null;
                let ep: number = policy.afterMaxDayRefundPercent ?? 0;

                for (const tier of sortedTiers) {
                    if (daysSince >= tier.fromDay && daysSince <= tier.toDay) {
                        matchedTier = tier;
                        ep = tier.refundPercent;
                        break;
                    }
                }

                const gross = (parsedAmount * ep) / 100;
                let fee = 0;
                if (policy.processingFeeType === 'flat') {
                    fee = Math.min(policy.processingFee ?? 0, gross);
                } else {
                    fee = (gross * (policy.processingFee ?? 0)) / 100;
                }
                const net = Math.max(0, gross - fee);

                eligiblePercent = ep;
                calculatedRefundAmount = Math.round(gross * 100) / 100;
                processingFee = Math.round(fee * 100) / 100;
                netRefundAmount = Math.round(net * 100) / 100;
            }
        } catch {
            // Non-critical — proceed without calculation
        }

        const request = await RefundRequest.create({
            tenantId,
            memberId,
            memberName,
            subscriptionId: subscriptionId || undefined,
            invoiceId: invoiceId || undefined,
            reason,
            reasonCategory,
            purchaseDate,
            amount: parsedAmount,
            calculatedRefundAmount,
            eligiblePercent,
            processingFee,
            netRefundAmount,
            status: 'pending',
        });

        // Notify admin (non-blocking, best-effort)
        try {
            const Notification = require('../models/Notification.model').default;
            // Find gym owner/admin for this tenant
            const User = require('../models/User.model').default;
            const admin = await User.findOne({
                tenantId,
                role: { $in: ['gym_owner', 'branch_manager', 'accountant'] },
            }).lean();
            if (admin) {
                await Notification.create({
                    tenantId,
                    recipientId: (admin as any)._id,
                    recipientType: 'staff',
                    type: 'push',
                    status: 'pending',
                    subject: 'New Refund Request',
                    message: `${memberName} submitted a refund request (${request.requestNumber}) for ₹${parsedAmount}.`,
                    metadata: { triggeredBy: 'refund_request', priority: 'normal' },
                    delivery: { retryCount: 0, maxRetries: 3 },
                    attempts: [],
                });
            }
        } catch {
            // Non-critical
        }

        res.status(201).json({
            success: true,
            data: request,
            message: "Refund request submitted. You'll hear back within 2-3 business days.",
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /stats — summary counts ─────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);

        const [pending, approved, rejected, processed, allProcessed] = await Promise.all([
            RefundRequest.countDocuments({ tenantId, status: 'pending' }),
            RefundRequest.countDocuments({ tenantId, status: 'approved' }),
            RefundRequest.countDocuments({ tenantId, status: 'rejected' }),
            RefundRequest.countDocuments({ tenantId, status: 'processed' }),
            RefundRequest.find({ tenantId, status: 'processed' }).select('netRefundAmount calculatedRefundAmount').lean(),
        ]);

        const totalRefundedAmount = allProcessed.reduce(
            (sum, r) => sum + ((r as any).netRefundAmount ?? (r as any).calculatedRefundAmount ?? 0),
            0,
        );

        res.json({
            success: true,
            data: { pending, approved, rejected, processed, totalRefundedAmount },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /my — member gets their own requests ─────────────────────────────────
router.get('/my', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const memberId = getUserId(req);
        const { page = '1', limit = '20' } = req.query as Record<string, string>;
        const skip = (+page - 1) * +limit;

        const [requests, total] = await Promise.all([
            RefundRequest.find({ tenantId, memberId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(+limit)
                .lean(),
            RefundRequest.countDocuments({ tenantId, memberId }),
        ]);

        res.json({ success: true, data: { requests, total, page: +page } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET / — admin gets all requests (paginated) ──────────────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { status, page = '1', limit = '20' } = req.query as Record<string, string>;

        const filter: Record<string, any> = { tenantId };
        if (status && status !== 'all') filter.status = status;

        const skip = (+page - 1) * +limit;
        const [requests, total] = await Promise.all([
            RefundRequest.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(+limit)
                .lean(),
            RefundRequest.countDocuments(filter),
        ]);

        res.json({ success: true, data: { requests, total, page: +page } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /:id — single request ────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const request = await RefundRequest.findOne({ _id: req.params.id, tenantId }).lean();
        if (!request) {
            res.status(404).json({ success: false, message: 'Refund request not found' });
            return;
        }
        res.json({ success: true, data: request });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PATCH /:id/approve — admin approves ─────────────────────────────────────
router.patch('/:id/approve', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const adminId = getUserId(req);
        const { adminNote, actualRefundAmount } = req.body;

        const existing = await RefundRequest.findOne({ _id: req.params.id, tenantId });
        if (!existing) {
            res.status(404).json({ success: false, message: 'Refund request not found' });
            return;
        }
        if (existing.status !== 'pending') {
            res.status(400).json({
                success: false,
                message: `Cannot approve a request with status '${existing.status}'`,
            });
            return;
        }

        const resolvedRefundAmount =
            actualRefundAmount !== undefined
                ? Number(actualRefundAmount)
                : existing.netRefundAmount ?? existing.calculatedRefundAmount;

        const updated = await RefundRequest.findByIdAndUpdate(
            req.params.id,
            {
                status: 'approved',
                approvedBy: adminId,
                approvedAt: new Date(),
                ...(adminNote !== undefined && { adminNote }),
                ...(resolvedRefundAmount !== undefined && { netRefundAmount: resolvedRefundAmount }),
            },
            { new: true }
        );

        res.json({ success: true, data: updated });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PATCH /:id/reject — admin rejects ────────────────────────────────────────
router.patch('/:id/reject', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const adminId = getUserId(req);
        const { adminNote } = req.body;

        const existing = await RefundRequest.findOne({ _id: req.params.id, tenantId });
        if (!existing) {
            res.status(404).json({ success: false, message: 'Refund request not found' });
            return;
        }
        if (existing.status !== 'pending') {
            res.status(400).json({
                success: false,
                message: `Cannot reject a request with status '${existing.status}'`,
            });
            return;
        }

        const updated = await RefundRequest.findByIdAndUpdate(
            req.params.id,
            {
                status: 'rejected',
                rejectedBy: adminId,
                rejectedAt: new Date(),
                ...(adminNote !== undefined && { adminNote }),
            },
            { new: true }
        );

        res.json({ success: true, data: updated });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PATCH /:id/process — mark as payment processed ──────────────────────────
router.patch('/:id/process', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { refundTransactionId } = req.body;

        const existing = await RefundRequest.findOne({ _id: req.params.id, tenantId });
        if (!existing) {
            res.status(404).json({ success: false, message: 'Refund request not found' });
            return;
        }
        if (existing.status !== 'approved') {
            res.status(400).json({
                success: false,
                message: `Only approved requests can be marked as processed (current: ${existing.status})`,
            });
            return;
        }

        const updated = await RefundRequest.findByIdAndUpdate(
            req.params.id,
            {
                status: 'processed',
                processedAt: new Date(),
                ...(refundTransactionId !== undefined && { refundTransactionId }),
            },
            { new: true }
        );

        res.json({ success: true, data: updated });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
