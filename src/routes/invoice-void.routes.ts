import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import CreditNote from '../models/CreditNote.model';

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

// ─── GET /voidable/:invoiceId — pre-check before voiding ─────────────────────
router.get('/voidable/:invoiceId', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);

        let invoice: any = null;
        try {
            const InvoiceModel = require('../models/Invoice.model').default;
            invoice = await InvoiceModel.findOne({ _id: req.params.invoiceId, tenantId }).lean();
        } catch {
            res.status(500).json({ success: false, message: 'Invoice model unavailable' });
            return;
        }

        if (!invoice) {
            res.status(404).json({ success: false, message: 'Invoice not found' });
            return;
        }

        const status = invoice.status?.toLowerCase();

        if (status === 'void' || status === 'voided' || status === 'cancelled') {
            res.json({
                success: true,
                data: {
                    canVoid: false,
                    reason: 'Invoice is already voided or cancelled',
                    willCreateCreditNote: false,
                },
            });
            return;
        }

        const isPaid = ['paid', 'partial'].includes(status);
        const invoiceTotal = invoice.total ?? invoice.amount ?? invoice.grandTotal ?? 0;

        res.json({
            success: true,
            data: {
                canVoid: true,
                reason: isPaid
                    ? 'Paid invoice — voiding will auto-create a credit note'
                    : 'Unpaid invoice — will be marked void',
                willCreateCreditNote: isPaid,
                creditNoteAmount: isPaid ? invoiceTotal : undefined,
                invoiceStatus: invoice.status,
                memberName: invoice.memberName,
                amount: invoiceTotal,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /:invoiceId — void or delete invoice ──────────────────────────────
router.delete('/:invoiceId', async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const adminId = getUserId(req);

        let invoice: any = null;
        let InvoiceModel: any = null;
        try {
            InvoiceModel = require('../models/Invoice.model').default;
            invoice = await InvoiceModel.findOne({ _id: req.params.invoiceId, tenantId });
        } catch {
            res.status(500).json({ success: false, message: 'Invoice model unavailable' });
            return;
        }

        if (!invoice) {
            res.status(404).json({ success: false, message: 'Invoice not found' });
            return;
        }

        const status = invoice.status?.toLowerCase();

        if (status === 'void' || status === 'voided' || status === 'cancelled') {
            res.status(400).json({
                success: false,
                message: 'Invoice is already voided or cancelled',
            });
            return;
        }

        const isPaid = ['paid', 'partial'].includes(status);
        const invoiceTotal = invoice.total ?? invoice.amount ?? invoice.grandTotal ?? 0;

        if (isPaid) {
            // Cannot delete a paid invoice — auto-create a credit note instead
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 90);

            const creditNote = await CreditNote.create({
                tenantId,
                originalInvoiceId: invoice._id.toString(),
                originalInvoiceNumber: invoice.invoiceNumber ?? invoice.number ?? undefined,
                memberId: invoice.memberId?.toString() ?? invoice.member?.toString() ?? 'unknown',
                memberName: invoice.memberName ?? 'Unknown Member',
                memberEmail: invoice.memberEmail ?? invoice.member?.email ?? undefined,
                amount: invoiceTotal,
                reason: 'invoice_voided',
                reasonDescription: 'Invoice voided by admin',
                status: 'issued',
                validUntil,
                issuedBy: adminId,
            });

            res.status(422).json({
                success: false,
                message:
                    'Paid invoices cannot be deleted. A credit note has been created instead.',
                creditNoteId: creditNote._id.toString(),
                creditNoteNumber: creditNote.creditNoteNumber,
                data: { creditNote },
            });
            return;
        }

        // Unpaid / pending invoice — mark void
        await InvoiceModel.findByIdAndUpdate(invoice._id, {
            status: 'void',
            voidedAt: new Date(),
            voidedBy: adminId,
        });

        // Create AuditLog entry (non-blocking)
        try {
            const AuditLog = require('../models/AuditLog.model').default;
            await AuditLog.create({
                tenantId,
                userId: adminId,
                action: 'delete',
                resource: 'Invoice',
                resourceId: invoice._id,
                changes: [{ field: 'status', oldValue: invoice.status, newValue: 'void' }],
                metadata: {
                    ipAddress: req.ip ?? '0.0.0.0',
                    userAgent: req.headers['user-agent'] ?? '',
                    method: req.method,
                    endpoint: req.originalUrl,
                    statusCode: 200,
                },
                severity: 'warning',
                description: `Invoice ${invoice.invoiceNumber ?? invoice._id} voided by admin`,
            });
        } catch {
            // Non-critical
        }

        res.json({ success: true, message: 'Invoice voided successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
