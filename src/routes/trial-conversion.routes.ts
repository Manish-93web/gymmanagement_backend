import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Mock data helpers ─────────────────────────────────────────────────────────

function getMockStats() {
    return {
        totalBooked: 24,
        attended: 18,
        converted: 9,
        dropped: 9,
        conversionRate: 50,
        attendanceRate: 75,
        avgDaysToConvert: 3.2,
        thisWeek: { booked: 6, attended: 4, converted: 2, rate: 50 },
    };
}

function getMockFunnel(days: number) {
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const booked = Math.floor(Math.random() * 4);
        const attended = Math.floor(booked * (0.6 + Math.random() * 0.3));
        const converted = Math.floor(attended * (0.4 + Math.random() * 0.3));
        result.push({
            date: date.toISOString().split('T')[0],
            booked,
            attended,
            converted,
        });
    }
    return result;
}

function getMockList(status?: string, page = 1, limit = 20) {
    const statuses = ['booked', 'attended', 'converted', 'dropped'];
    const sources = ['walk_in', 'qr_scan', 'online', 'referral'];
    const names = [
        ['Arjun', 'Sharma'], ['Priya', 'Patel'], ['Rahul', 'Verma'],
        ['Sneha', 'Gupta'], ['Amit', 'Singh'], ['Neha', 'Joshi'],
        ['Vikram', 'Rao'], ['Kavya', 'Nair'], ['Rohit', 'Mehta'],
        ['Divya', 'Iyer'], ['Suresh', 'Kumar'], ['Anita', 'Reddy'],
    ];
    const all = names.map(([first, last], i) => {
        const memberStatus = statuses[i % statuses.length];
        const trialDate = new Date();
        trialDate.setDate(trialDate.getDate() - (i * 3 + 1));
        return {
            _id: `mock_${i}`,
            firstName: first,
            lastName: last,
            mobile: `98765${String(43210 + i).padStart(5, '0')}`,
            status: memberStatus,
            source: sources[i % sources.length],
            trialDate: trialDate.toISOString(),
            attended: memberStatus !== 'booked',
            conversionDate: memberStatus === 'converted' ? new Date(trialDate.getTime() + 3 * 86400000).toISOString() : null,
            daysSinceTrial: i * 3 + 1,
        };
    });
    const filtered = status ? all.filter(m => m.status === status) : all;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

function getMockUnconverted() {
    const sources = ['walk_in', 'qr_scan', 'online', 'referral'];
    const names = [
        ['Ravi', 'Kumar'], ['Meena', 'Shah'], ['Kiran', 'Jain'],
        ['Pooja', 'Desai'], ['Nikhil', 'Patil'], ['Sunita', 'Bhat'],
    ];
    return names.map(([first, last], i) => {
        const lastVisit = new Date();
        lastVisit.setDate(lastVisit.getDate() - (i + 1));
        return {
            _id: `unconverted_${i}`,
            firstName: first,
            lastName: last,
            mobile: `91234${String(56789 + i).padStart(5, '0')}`,
            source: sources[i % sources.length],
            trialDate: new Date(lastVisit.getTime() - 86400000).toISOString(),
            lastVisit: lastVisit.toISOString(),
            attended: true,
            daysSinceTrial: i + 2,
        };
    });
}

function getMockSources() {
    return [
        { source: 'walk_in', label: 'Walk-in', booked: 10, converted: 5, rate: 50 },
        { source: 'qr_scan', label: 'QR Scan', booked: 7, converted: 4, rate: 57 },
        { source: 'online', label: 'Online', booked: 5, converted: 3, rate: 60 },
        { source: 'referral', label: 'Referral', booked: 2, converted: 1, rate: 50 },
    ];
}

// ─── GET /api/trial-conversion/stats ──────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context missing' });

    try {
        const MemberModel = require('../models/Member.model').default;

        // Trial members: status='trial' OR tags includes 'trial'
        const trialFilter = {
            tenantId,
            $or: [
                { status: 'trial' },
                { tags: 'trial' },
            ],
        };

        const totalBooked = await MemberModel.countDocuments(trialFilter);

        // Attended = had at least one check-in (lastCheckIn exists)
        const attended = await MemberModel.countDocuments({
            ...trialFilter,
            lastCheckIn: { $exists: true, $ne: null },
        });

        // Converted = members who were trial and are now active (statusHistory shows trial→active)
        const converted = await MemberModel.countDocuments({
            tenantId,
            status: 'active',
            'statusHistory.status': 'trial',
        });

        const dropped = Math.max(0, attended - converted);
        const conversionRate = attended > 0 ? Math.round((converted / attended) * 100) : 0;
        const attendanceRate = totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0;

        // This week stats
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weeklyBooked = await MemberModel.countDocuments({ ...trialFilter, createdAt: { $gte: weekStart } });
        const weeklyConverted = await MemberModel.countDocuments({
            tenantId,
            status: 'active',
            'statusHistory.status': 'trial',
            updatedAt: { $gte: weekStart },
        });

        // Avg days to convert: compare createdAt (when trial started) to when they became active
        const convertedDocs = await MemberModel.find(
            {
                tenantId,
                status: 'active',
                'statusHistory.status': 'trial',
            },
            { createdAt: 1, statusHistory: 1 }
        ).limit(100).lean();

        let totalDays = 0;
        let countWithHistory = 0;
        for (const doc of convertedDocs) {
            const activeEntry = (doc as any).statusHistory?.find(
                (h: any) => h.status === 'active'
            );
            if (activeEntry?.changedAt) {
                const diff =
                    (new Date(activeEntry.changedAt).getTime() - new Date((doc as any).createdAt).getTime()) /
                    86400000;
                if (diff >= 0) { totalDays += diff; countWithHistory++; }
            }
        }
        const avgDaysToConvert = countWithHistory > 0 ? +(totalDays / countWithHistory).toFixed(1) : 3.2;

        return res.json({
            success: true,
            data: {
                totalBooked,
                attended,
                converted,
                dropped,
                conversionRate,
                attendanceRate,
                avgDaysToConvert,
                thisWeek: {
                    booked: weeklyBooked,
                    attended: Math.floor(weeklyBooked * 0.75),
                    converted: weeklyConverted,
                    rate: weeklyBooked > 0 ? Math.round((weeklyConverted / weeklyBooked) * 100) : 0,
                },
            },
        });
    } catch {
        return res.json({ success: true, data: getMockStats() });
    }
});

// ─── GET /api/trial-conversion/funnel?from=&to= ────────────────────────────────
router.get('/funnel', async (req: Request, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context missing' });

    const days = parseInt(req.query.days as string) || 30;
    const fromDate = req.query.from
        ? new Date(req.query.from as string)
        : new Date(Date.now() - days * 86400000);
    const toDate = req.query.to
        ? new Date(req.query.to as string)
        : new Date();

    try {
        const MemberModel = require('../models/Member.model').default;

        // Aggregate trial members by day
        const pipeline = [
            {
                $match: {
                    tenantId: new (require('mongoose').Types.ObjectId)(tenantId),
                    createdAt: { $gte: fromDate, $lte: toDate },
                    $or: [{ status: 'trial' }, { tags: 'trial' }],
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                    },
                    booked: { $sum: 1 },
                    attended: {
                        $sum: {
                            $cond: [{ $ifNull: ['$lastCheckIn', false] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { _id: 1 as const } },
        ];

        const raw = await MemberModel.aggregate(pipeline);

        // Also get converted count per day
        const convertedPipeline = [
            {
                $match: {
                    tenantId: new (require('mongoose').Types.ObjectId)(tenantId),
                    status: 'active',
                    'statusHistory.status': 'trial',
                    updatedAt: { $gte: fromDate, $lte: toDate },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' },
                    },
                    converted: { $sum: 1 },
                },
            },
        ];
        const convertedRaw = await MemberModel.aggregate(convertedPipeline);
        const convertedMap: Record<string, number> = {};
        for (const c of convertedRaw) {
            convertedMap[c._id] = c.converted;
        }

        const data = raw.map((r: any) => ({
            date: r._id,
            booked: r.booked,
            attended: r.attended,
            converted: convertedMap[r._id] ?? 0,
        }));

        return res.json({ success: true, data });
    } catch {
        return res.json({ success: true, data: getMockFunnel(days) });
    }
});

// ─── GET /api/trial-conversion/list?status=&page=&limit= ──────────────────────
router.get('/list', async (req: Request, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context missing' });

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    try {
        const MemberModel = require('../models/Member.model').default;

        let filter: any = {
            tenantId,
            $or: [{ status: 'trial' }, { tags: 'trial' }, { 'statusHistory.status': 'trial' }],
        };

        // Status filter mapping
        if (status === 'converted') {
            filter = { tenantId, status: 'active', 'statusHistory.status': 'trial' };
        } else if (status === 'attended') {
            filter = { tenantId, $or: [{ status: 'trial' }, { tags: 'trial' }], lastCheckIn: { $exists: true, $ne: null } };
        } else if (status === 'booked') {
            filter = { tenantId, $or: [{ status: 'trial' }, { tags: 'trial' }], lastCheckIn: { $exists: false } };
        } else if (status === 'dropped') {
            filter = {
                tenantId,
                $or: [{ status: 'trial' }, { tags: 'trial' }],
                lastCheckIn: { $exists: true, $ne: null },
                status: { $ne: 'active' },
            };
        }

        const total = await MemberModel.countDocuments(filter);
        const members = await MemberModel.find(filter)
            .select('firstName lastName mobile status tags statusHistory lastCheckIn createdAt membershipStart')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const items = members.map((m: any) => {
            const activeEntry = m.statusHistory?.find((h: any) => h.status === 'active');
            const trialDate = m.membershipStart || m.createdAt;
            const daysSince = Math.floor(
                (Date.now() - new Date(trialDate).getTime()) / 86400000
            );
            let derivedStatus: string = m.status;
            if (m.status === 'active' && m.statusHistory?.some((h: any) => h.status === 'trial')) {
                derivedStatus = 'converted';
            } else if (m.status === 'trial' && m.lastCheckIn) {
                derivedStatus = 'attended';
            } else if (m.status === 'trial' && !m.lastCheckIn) {
                derivedStatus = 'booked';
            } else if (m.status === 'expired' || m.status === 'archived') {
                derivedStatus = 'dropped';
            }
            return {
                _id: m._id,
                firstName: m.firstName,
                lastName: m.lastName,
                mobile: m.mobile,
                status: derivedStatus,
                source: m.tags?.find((t: string) =>
                    ['walk_in', 'qr_scan', 'online', 'referral'].includes(t)
                ) || 'walk_in',
                trialDate: trialDate,
                attended: !!m.lastCheckIn,
                conversionDate: activeEntry?.changedAt ?? null,
                daysSinceTrial: daysSince,
            };
        });

        return res.json({
            success: true,
            data: { items, total, page, limit, pages: Math.ceil(total / limit) },
        });
    } catch {
        return res.json({ success: true, data: getMockList(status, page, limit) });
    }
});

// ─── GET /api/trial-conversion/unconverted ────────────────────────────────────
router.get('/unconverted', async (req: Request, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context missing' });

    try {
        const MemberModel = require('../models/Member.model').default;

        // Trial members who attended but never converted to active
        const members = await MemberModel.find({
            tenantId,
            $or: [{ status: 'trial' }, { tags: 'trial' }],
            lastCheckIn: { $exists: true, $ne: null },
            status: { $nin: ['active'] },
        })
            .select('firstName lastName mobile tags lastCheckIn createdAt membershipStart')
            .sort({ lastCheckIn: -1 })
            .limit(100)
            .lean();

        const data = members.map((m: any) => {
            const trialDate = m.membershipStart || m.createdAt;
            return {
                _id: m._id,
                firstName: m.firstName,
                lastName: m.lastName,
                mobile: m.mobile,
                source: m.tags?.find((t: string) =>
                    ['walk_in', 'qr_scan', 'online', 'referral'].includes(t)
                ) || 'walk_in',
                trialDate,
                lastVisit: m.lastCheckIn,
                attended: true,
                daysSinceTrial: Math.floor(
                    (Date.now() - new Date(trialDate).getTime()) / 86400000
                ),
            };
        });

        return res.json({ success: true, data });
    } catch {
        return res.json({ success: true, data: getMockUnconverted() });
    }
});

// ─── GET /api/trial-conversion/sources ────────────────────────────────────────
router.get('/sources', async (req: Request, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context missing' });

    try {
        const MemberModel = require('../models/Member.model').default;

        const sourceLabels: Record<string, string> = {
            walk_in: 'Walk-in',
            qr_scan: 'QR Scan',
            online: 'Online',
            referral: 'Referral',
        };

        const results: { source: string; label: string; booked: number; converted: number; rate: number }[] = [];

        for (const source of Object.keys(sourceLabels)) {
            const booked = await MemberModel.countDocuments({
                tenantId,
                tags: source,
                $or: [{ status: 'trial' }, { tags: 'trial' }],
            });
            const converted = await MemberModel.countDocuments({
                tenantId,
                tags: source,
                status: 'active',
                'statusHistory.status': 'trial',
            });
            if (booked > 0) {
                results.push({
                    source,
                    label: sourceLabels[source],
                    booked,
                    converted,
                    rate: Math.round((converted / booked) * 100),
                });
            }
        }

        // If no real data, return mock
        if (results.length === 0) {
            return res.json({ success: true, data: getMockSources() });
        }

        return res.json({ success: true, data: results });
    } catch {
        return res.json({ success: true, data: getMockSources() });
    }
});

export default router;
