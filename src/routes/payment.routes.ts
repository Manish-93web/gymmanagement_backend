import { Router, Request, Response, NextFunction } from 'express';
import Payment from '../models/Payment.model';
import Tenant from '../models/Tenant.model';
import paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// ─── Webhook routes (NO auth — signature-verified) ───────────────────────────
const captureRawBody = (req: Request, res: Response, next: NextFunction) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => {
        (req as any).rawBody = data;
        try { req.body = JSON.parse(data || '{}'); } catch { req.body = {}; }
        next();
    });
};

router.post('/webhook/razorpay', captureRawBody, paymentController.handleRazorpayWebhook.bind(paymentController));
router.post('/webhook/stripe', captureRawBody, paymentController.handleStripeWebhook.bind(paymentController));

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.use(authenticate);


// Create payment
router.post(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createPayment.bind(paymentController)
);

// Create Razorpay order
router.post(
    '/:paymentId/razorpay-order',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createRazorpayOrder.bind(paymentController)
);

// Create Stripe payment intent
router.post(
    '/:paymentId/stripe-intent',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.createStripeIntent.bind(paymentController)
);

// Process payment
router.post(
    '/:paymentId/process',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'),
    paymentController.processPayment.bind(paymentController)
);

// Process refund
router.post(
    '/:paymentId/refund',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'),
    paymentController.processRefund.bind(paymentController)
);

// Get payment statistics
router.get(
    '/stats',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPaymentStats.bind(paymentController)
);

// Revenue analytics — monthly revenue grouped by month
router.get(
    '/revenue-analytics',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = req.tenantId;
            const monthlyRevenue = await Payment.aggregate([
                { $match: { tenantId, status: 'completed' } },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        revenue: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
                { $limit: 12 },
                {
                    $project: {
                        _id: 0,
                        month: {
                            $let: {
                                vars: {
                                    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                                },
                                in: { $arrayElemAt: ['$$months', { $subtract: ['$_id.month', 1] }] },
                            },
                        },
                        year: '$_id.year',
                        revenue: 1,
                        count: 1,
                    },
                },
            ]);
            res.json({ success: true, data: { monthlyRevenue } });
        } catch (err) { next(err); }
    }
);

// Generate HTML invoice for a payment
router.get(
    '/:paymentId/invoice',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { paymentId } = req.params;
            const payment = await Payment.findById(paymentId)
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .lean() as any;
            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
            const tenant = await Tenant.findById(payment.tenantId).select('name contactInfo branding billing').lean() as any;
            const member = payment.memberId;
            const fmt = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;
            const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
            const invoiceNumber = payment.invoiceNumber || `INV-${payment._id.toString().slice(-8).toUpperCase()}`;
            const subtotal = payment.amount?.subtotal ?? payment.amount ?? 0;
            const discountAmt = payment.amount?.discountAmount ?? 0;
            const taxAmount = payment.amount?.taxAmount ?? 0;
            const total = payment.amount?.total ?? payment.amount ?? 0;
            const statusColor = payment.status === 'completed' ? '#22c55e' : payment.status === 'failed' ? '#ef4444' : '#f59e0b';
            const memberName = member ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() : 'Member';
            const items = payment.metadata?.items?.length
                ? payment.metadata.items
                : [{ name: payment.metadata?.description || `Membership ${payment.type || 'Payment'}`, qty: 1, price: subtotal, total: subtotal }];
            const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Invoice ${invoiceNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#0a0a0a;color:#fff;padding:40px}.page{max-width:720px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;overflow:hidden}.header{background:linear-gradient(135deg,#ea580c,#f97316);padding:32px 40px;display:flex;justify-content:space-between;align-items:flex-start}.brand{font-size:22px;font-weight:900;color:#fff}.invoice-label{text-align:right}.invoice-label h2{font-size:28px;font-weight:900;color:#fff}.status-badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:9px;font-weight:900;text-transform:uppercase;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;margin-top:6px}.body{padding:32px 40px}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}.meta-block h4{font-size:9px;font-weight:900;text-transform:uppercase;color:#ea580c;margin-bottom:8px}.meta-block p{font-size:13px;color:#e5e7eb;line-height:1.7}.line-items{width:100%;border-collapse:collapse;margin-bottom:24px}.line-items th{padding:8px 12px;text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #222}.line-items td{padding:14px 12px;font-size:13px;color:#e5e7eb;border-bottom:1px solid #1a1a1a}.r{text-align:right}.totals{margin-left:auto;width:260px}.totals-row{display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#9ca3af}.grand{border-top:1px solid #333;margin-top:8px;padding-top:12px;font-size:16px;font-weight:900;color:#fff}.footer{padding:24px 40px;background:#0d0d0d;border-top:1px solid #1a1a1a;display:flex;justify-content:space-between}.footer p{font-size:10px;color:#6b7280}</style></head><body><div class="page"><div class="header"><div><div class="brand">${tenant?.name ?? 'Gym'}</div></div><div class="invoice-label"><h2>INVOICE</h2><p>${invoiceNumber}</p><span class="status-badge">${(payment.status || 'pending').toUpperCase()}</span></div></div><div class="body"><div class="meta-grid"><div class="meta-block"><h4>Bill To</h4><p style="font-size:15px;font-weight:700;color:#fff">${memberName}</p>${member?.email ? `<p>${member.email}</p>` : ''}${member?.mobile ? `<p>${member.mobile}</p>` : ''}</div><div class="meta-block" style="text-align:right"><h4>Invoice Details</h4><p>Date: ${fmtDate(payment.paidAt || payment.createdAt)}</p><p>Method: ${(payment.method ?? payment.paymentMethod ?? 'cash').replace('_',' ').toUpperCase()}</p></div></div><table class="line-items"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${items.map((it: any) => `<tr><td><strong style="color:#fff">${it.name}</strong></td><td class="r">${it.qty ?? 1}</td><td class="r">${fmt(it.price)}</td><td class="r" style="font-weight:700;color:#fff">${fmt(it.total)}</td></tr>`).join('')}</tbody></table><div class="totals"><div class="totals-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>${discountAmt > 0 ? `<div class="totals-row"><span>Discount</span><span style="color:#22c55e">−${fmt(discountAmt)}</span></div>` : ''}${taxAmount > 0 ? `<div class="totals-row"><span>Tax</span><span>${fmt(taxAmount)}</span></div>` : ''}<div class="totals-row grand"><span>Total</span><span style="color:#ea580c">${fmt(total)}</span></div></div></div><div class="footer"><p>Thank you for your payment!</p><p>Generated on ${new Date().toLocaleDateString('en-IN')}</p></div></div></body></html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="invoice-${invoiceNumber}.html"`);
            res.send(html);
        } catch (err) { next(err); }
    }
);

// Get payment by ID
router.get(
    '/:paymentId',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPaymentById.bind(paymentController)
);

// Get all payments
router.get(
    '/',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'),
    paymentController.getPayments.bind(paymentController)
);

// Checkout endpoint
router.post(
    '/checkout',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'accountant', 'super_admin'),
    paymentController.getCheckoutDetails.bind(paymentController)
);

// Export payments
router.get(
    '/export',
    requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'auditor', 'super_admin'),
    paymentController.exportPayments.bind(paymentController)
);

export default router;
