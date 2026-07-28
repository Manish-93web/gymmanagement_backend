import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import CreditNote from '../models/CreditNote.model';

const router = Router();

router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTenantId(req: Request): string {
    return (req as any).tenantId as string;
}

function getIssuedBy(req: Request): string {
    const user = (req as any).user;
    return user?._id?.toString() ?? user?.id?.toString() ?? 'system';
}

// ─── GET / — list credit notes ────────────────────────────────────────────────
router.get(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const { status, memberId, page = '1', limit = '20' } = req.query as Record<string, string>;

            const filter: Record<string, any> = { tenantId };
            if (status && status !== 'all') filter.status = status;
            if (memberId) filter.memberId = memberId;

            const skip = (+page - 1) * +limit;
            const [creditNotes, total] = await Promise.all([
                CreditNote.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
                CreditNote.countDocuments(filter),
            ]);

            res.json({ success: true, data: { creditNotes, total, page: +page } });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get(
    '/stats',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);

            const [all, issued, applied, refunded] = await Promise.all([
                CreditNote.find({ tenantId }).lean(),
                CreditNote.find({ tenantId, status: 'issued' }).lean(),
                CreditNote.find({ tenantId, status: 'applied' }).lean(),
                CreditNote.find({ tenantId, status: 'refunded' }).lean(),
            ]);

            const sum = (arr: any[]) => arr.reduce((s, cn) => s + (cn.amount ?? 0), 0);

            res.json({
                success: true,
                data: {
                    total: all.length,
                    issued: issued.length,
                    applied: applied.length,
                    refunded: refunded.length,
                    totalAmount: sum(all),
                    availableAmount: sum(issued),
                },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── GET /:id — single credit note ───────────────────────────────────────────
router.get(
    '/:id',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const cn = await CreditNote.findOne({ _id: req.params.id, tenantId }).lean();
            if (!cn) {
                res.status(404).json({ success: false, message: 'Credit note not found' });
                return;
            }
            res.json({ success: true, data: cn });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── POST / — create credit note manually ─────────────────────────────────────
router.post(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const {
                memberId, memberName, memberEmail, amount,
                reason, reasonDescription, originalInvoiceId, originalInvoiceNumber,
            } = req.body;

            if (!memberId || !memberName || !amount || !reason) {
                res.status(400).json({ success: false, message: 'memberId, memberName, amount, reason are required' });
                return;
            }

            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 90);

            const cn = await CreditNote.create({
                tenantId,
                originalInvoiceId: originalInvoiceId ?? 'manual',
                originalInvoiceNumber,
                memberId,
                memberName,
                memberEmail,
                amount: +amount,
                reason,
                reasonDescription,
                status: 'issued',
                validUntil,
                issuedBy: getIssuedBy(req),
            });

            res.status(201).json({ success: true, data: cn });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── POST /void-invoice/:invoiceId — void invoice + auto credit note ──────────
router.post(
    '/void-invoice/:invoiceId',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const { reason = 'Voided by admin', voidReason } = req.body;
            const finalReason = voidReason ?? reason;

            try {
                const InvoiceModel = require('../models/Invoice.model').default;
                const invoice = await InvoiceModel.findOne({ _id: req.params.invoiceId, tenantId });
                if (!invoice) {
                    res.status(404).json({ success: false, message: 'Invoice not found' });
                    return;
                }
                if (invoice.status === 'void' || invoice.status === 'voided' || invoice.status === 'cancelled') {
                    res.status(400).json({ success: false, message: 'Invoice is already voided or cancelled' });
                    return;
                }

                const wasPaid = ['paid', 'partial'].includes(invoice.status);
                await InvoiceModel.findByIdAndUpdate(invoice._id, {
                    status: 'void',
                    voidedAt: new Date(),
                    voidReason: finalReason,
                });

                let creditNote = null;
                const invoiceTotal = invoice.total ?? invoice.amount ?? invoice.grandTotal ?? 0;

                if (wasPaid && invoiceTotal > 0) {
                    const validUntil = new Date();
                    validUntil.setDate(validUntil.getDate() + 90);

                    creditNote = await CreditNote.create({
                        tenantId,
                        originalInvoiceId: invoice._id.toString(),
                        originalInvoiceNumber: invoice.invoiceNumber ?? invoice.number ?? undefined,
                        memberId: invoice.memberId?.toString() ?? invoice.member?.toString() ?? 'unknown',
                        memberName: invoice.memberName ?? invoice.member?.name ?? 'Unknown Member',
                        memberEmail: invoice.memberEmail ?? invoice.member?.email ?? undefined,
                        amount: invoiceTotal,
                        reason: 'invoice_voided',
                        reasonDescription: finalReason,
                        status: 'issued',
                        validUntil,
                        issuedBy: getIssuedBy(req),
                    });
                }

                res.json({ success: true, data: { invoice, creditNote } });
            } catch (innerErr: any) {
                // If Invoice model doesn't exist or has a different structure
                res.status(500).json({ success: false, message: innerErr.message });
            }
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── PATCH /:id/apply — apply credit note to an invoice ──────────────────────
router.patch(
    '/:id/apply',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const { appliedToInvoiceId } = req.body;

            if (!appliedToInvoiceId) {
                res.status(400).json({ success: false, message: 'appliedToInvoiceId is required' });
                return;
            }

            const cn = await CreditNote.findOneAndUpdate(
                { _id: req.params.id, tenantId, status: 'issued' },
                { status: 'applied', appliedToInvoiceId },
                { new: true },
            );
            if (!cn) {
                res.status(404).json({ success: false, message: 'Credit note not found or not in issued status' });
                return;
            }
            res.json({ success: true, data: cn });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── PATCH /:id/refund — mark as refunded ────────────────────────────────────
router.patch(
    '/:id/refund',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const { refundMethod } = req.body;

            const cn = await CreditNote.findOneAndUpdate(
                { _id: req.params.id, tenantId, status: { $in: ['issued', 'applied'] } },
                { status: 'refunded', refundedAt: new Date(), refundMethod: refundMethod ?? 'cash' },
                { new: true },
            );
            if (!cn) {
                res.status(404).json({ success: false, message: 'Credit note not found or already refunded' });
                return;
            }
            res.json({ success: true, data: cn });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── DELETE /:id — delete credit note (admin only) ───────────────────────────
router.delete(
    '/:id',
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = getTenantId(req);
            const result = await CreditNote.findOneAndDelete({ _id: req.params.id, tenantId });
            if (!result) {
                res.status(404).json({ success: false, message: 'Credit note not found' });
                return;
            }
            res.json({ success: true, message: 'Credit note deleted' });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

export default router;
