import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Expense from '../models/Expense.model';

const router = Router();

router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tenantId(req: Request): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId((req as any).tenantId as string);
}

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStart = startOfDay(now);

        // Import Payment model dynamically to avoid circular deps
        const Payment = (await import('../models/Payment.model')).default;

        const [todayRevResult, monthRevResult, totalExpenses, pendingPayments] = await Promise.all([
            Payment.aggregate([
                { $match: { tenantId: tid, status: 'completed', createdAt: { $gte: todayStart, $lte: endOfDay(now) } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tid, status: 'completed', createdAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Expense.aggregate([
                { $match: { tenantId: tid, date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tid, status: { $in: ['pending', 'failed'] } } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
        ]);

        const todayRevenue     = todayRevResult[0]?.total ?? 0;
        const monthlyRevenue   = monthRevResult[0]?.total ?? 0;
        const monthExpenses    = totalExpenses[0]?.total ?? 0;
        const outstandingDues  = pendingPayments[0]?.total ?? 0;

        // Recent transactions (last 10)
        const recentPayments = await Payment.find({ tenantId: tid })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('memberId', 'firstName lastName')
            .lean();

        const recentTransactions = recentPayments.map((p: any) => ({
            _id: p._id,
            description: `${p.memberId?.firstName ?? ''} ${p.memberId?.lastName ?? ''}`.trim() || 'Unknown Member',
            date: p.createdAt,
            amount: p.amount,
            method: p.paymentMethod ?? 'cash',
            type: 'revenue' as const,
        }));

        res.json({
            success: true,
            data: {
                todayRevenue, monthlyRevenue, outstandingDues,
                totalExpenses: monthExpenses,
                netPL: monthlyRevenue - monthExpenses,
                recentTransactions,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Expenses CRUD ────────────────────────────────────────────────────────────
router.get('/expenses', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const { category, month, year, page = '1', limit = '50', startDate, endDate } = req.query as Record<string, string>;

        const filter: Record<string, any> = { tenantId: tid };
        if (category && category !== 'all') filter.category = category;

        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate)   filter.date.$lte = endOfDay(new Date(endDate));
        } else if (month && year) {
            const m = +month - 1;
            filter.date = {
                $gte: new Date(+year, m, 1),
                $lt:  new Date(+year, m + 1, 1),
            };
        } else if (year) {
            filter.date = { $gte: new Date(+year, 0, 1), $lt: new Date(+year + 1, 0, 1) };
        }

        const skip = (+page - 1) * +limit;
        const [expenses, total, summary] = await Promise.all([
            Expense.find(filter).sort({ date: -1 }).skip(skip).limit(+limit).lean(),
            Expense.countDocuments(filter),
            Expense.aggregate([
                { $match: filter },
                { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
            ]),
        ]);

        const grandTotal = summary.reduce((s, c) => s + c.total, 0);

        res.json({ success: true, data: { expenses, total, page: +page, summary, grandTotal } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/expenses', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const userId = (req as any).user?._id ?? (req as any).user?.id;
        const { category, description, amount, vendor, date, notes, receiptUrl } = req.body;
        if (!category || !description || !amount || !date) {
            res.status(400).json({ success: false, message: 'category, description, amount, date required' });
            return;
        }
        const expense = await Expense.create({
            tenantId: tid,
            branchId: (req as any).branchId,
            category, description,
            amount: +amount,
            vendor, date: new Date(date),
            notes, receiptUrl,
            createdBy: userId,
        });
        res.status(201).json({ success: true, data: expense });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/expenses/:id', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const { category, description, amount, vendor, date, notes, receiptUrl } = req.body;
        const expense = await Expense.findOneAndUpdate(
            { _id: req.params.id, tenantId: tid },
            { category, description, amount: amount ? +amount : undefined, vendor, date: date ? new Date(date) : undefined, notes, receiptUrl },
            { new: true, runValidators: true },
        );
        if (!expense) { res.status(404).json({ success: false, message: 'Expense not found' }); return; }
        res.json({ success: true, data: expense });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/expenses/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const result = await Expense.findOneAndDelete({ _id: req.params.id, tenantId: tenantId(req) });
        if (!result) { res.status(404).json({ success: false, message: 'Expense not found' }); return; }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── P&L Report ──────────────────────────────────────────────────────────────
router.get('/pl-report', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const year = req.query.year ? +req.query.year : new Date().getFullYear();
        const Payment = (await import('../models/Payment.model')).default;

        const [revenueByMonth, expenseByMonth] = await Promise.all([
            Payment.aggregate([
                {
                    $match: {
                        tenantId: tid,
                        status: 'completed',
                        createdAt: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) },
                    },
                },
                { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$amount.total' }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            Expense.aggregate([
                {
                    $match: {
                        tenantId: tid,
                        date: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) },
                    },
                },
                { $group: { _id: { $month: '$date' }, expenses: { $sum: '$amount' }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
        ]);

        // Build 12-month array
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const months = MONTHS.map((label, i) => {
            const m = i + 1;
            const rev = revenueByMonth.find((r: any) => r._id === m);
            const exp = expenseByMonth.find((e: any) => e._id === m);
            const revenue  = rev?.revenue  ?? 0;
            const expenses = exp?.expenses ?? 0;
            return { month: label, monthNum: m, revenue, expenses, netPL: revenue - expenses };
        });

        const totals = months.reduce(
            (acc, m) => ({ revenue: acc.revenue + m.revenue, expenses: acc.expenses + m.expenses, netPL: acc.netPL + m.netPL }),
            { revenue: 0, expenses: 0, netPL: 0 },
        );

        // Category breakdown for the year
        const expenseByCategory = await Expense.aggregate([
            { $match: { tenantId: tid, date: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } } },
            { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
        ]);

        res.json({ success: true, data: { year, months, totals, expenseByCategory } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Invoices + Payments (proxy stubs that proxy to billing/payment routes) ──
// The mobile Finance module also calls these — we provide lightweight wrappers
router.get('/transactions', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'), async (req: Request, res: Response) => {
    try {
        const tid = tenantId(req);
        const Payment = (await import('../models/Payment.model')).default;
        const { page = '1', limit = '20', status, startDate, endDate } = req.query as Record<string, string>;
        const filter: Record<string, any> = { tenantId: tid };
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate)   filter.createdAt.$lte = endOfDay(new Date(endDate));
        }
        const skip = (+page - 1) * +limit;
        const [payments, total] = await Promise.all([
            Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit)
                .populate('memberId', 'firstName lastName phone').lean(),
            Payment.countDocuments(filter),
        ]);
        res.json({ success: true, data: { transactions: payments, total, page: +page } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
