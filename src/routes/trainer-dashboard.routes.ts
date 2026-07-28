import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All trainer-dashboard routes require authentication only —
// tenantId is resolved from the logged-in user's own record (no tenantContext middleware needed)
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trainer-dashboard/my-dashboard
// Personal overview: today's sessions, earnings, clients, attendance, birthdays
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-dashboard', async (req: Request, res: Response): Promise<void> => {
    try {
        const User = require('../models/User.model').default;
        const userDoc = await User.findById((req as any).user._id).lean();
        if (!userDoc) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const tenantId = userDoc.tenantId;

        // Resolve the Trainer profile (trainerId in Class refers to Trainer model)
        const TrainerModel = require('../models/Trainer.model').default;
        const trainerDoc = await TrainerModel.findOne({ userId: userDoc._id, tenantId }).lean();

        // ── Today's scheduled classes ────────────────────────────────────────
        const Class = require('../models/Class.model').default;
        const todaySessions: any[] = [];
        if (trainerDoc) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const todayDow = today.getDay(); // 0 = Sunday

            const allTrainerClasses = await Class.find({
                tenantId,
                trainerId: trainerDoc._id,
                isActive: true,
                isCancelled: false,
                'schedule.startDate': { $lte: tomorrow },
            })
                .select('name schedule capacity type')
                .lean();

            for (const cls of allTrainerClasses) {
                const { recurrence, startDate, endDate, daysOfWeek, startTime, endTime } = cls.schedule;
                const clsStart = new Date(startDate);
                clsStart.setHours(0, 0, 0, 0);

                if (recurrence === 'once') {
                    if (clsStart.getTime() >= today.getTime() && clsStart.getTime() < tomorrow.getTime()) {
                        todaySessions.push({ ...cls, startTime, endTime });
                    }
                } else if (recurrence === 'daily') {
                    if (!endDate || new Date(endDate) >= today) {
                        todaySessions.push({ ...cls, startTime, endTime });
                    }
                } else if (recurrence === 'weekly') {
                    if (
                        Array.isArray(daysOfWeek) &&
                        daysOfWeek.includes(todayDow) &&
                        (!endDate || new Date(endDate) >= today)
                    ) {
                        todaySessions.push({ ...cls, startTime, endTime });
                    }
                } else if (recurrence === 'monthly') {
                    if (
                        clsStart.getDate() === today.getDate() &&
                        (!endDate || new Date(endDate) >= today)
                    ) {
                        todaySessions.push({ ...cls, startTime, endTime });
                    }
                }
            }
        }

        // ── This month earnings ──────────────────────────────────────────────
        let thisMonthEarnings = 0;
        try {
            const TrainerCommission = require('../models/TrainerCommission.model').default;
            const today2 = new Date();
            const monthStart = new Date(today2.getFullYear(), today2.getMonth(), 1);
            const agg = await TrainerCommission.aggregate([
                {
                    $match: {
                        tenantId,
                        trainerId: trainerDoc?._id ?? userDoc._id,
                        createdAt: { $gte: monthStart },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            thisMonthEarnings = agg[0]?.total || 0;
        } catch {
            // Model may not exist yet — default to 0
        }

        // ── Total assigned clients ───────────────────────────────────────────
        let totalClients = 0;
        try {
            const Member = require('../models/Member.model').default;
            totalClients = await Member.countDocuments({
                tenantId,
                'preferences.preferredTrainer': userDoc._id,
            });
        } catch {
            // Graceful fallback
        }

        // ── Attendance count this month ──────────────────────────────────────
        let attendanceThisMonth = 0;
        try {
            const Attendance = require('../models/Attendance.model').default;
            const today3 = new Date();
            const monthStart2 = new Date(today3.getFullYear(), today3.getMonth(), 1);
            attendanceThisMonth = await Attendance.countDocuments({
                tenantId,
                trainerId: userDoc._id,
                checkInTime: { $gte: monthStart2 },
            });
        } catch {
            // Graceful fallback
        }

        // ── Upcoming birthdays (next 7 days) ─────────────────────────────────
        const upcomingBirthdays: { name: string; date: string }[] = [];
        try {
            const Member = require('../models/Member.model').default;
            const today4 = new Date();
            const in7 = new Date(today4);
            in7.setDate(in7.getDate() + 7);
            const assignedMembers = await Member.find({
                tenantId,
                'preferences.preferredTrainer': userDoc._id,
                'personalInfo.dateOfBirth': { $exists: true, $ne: null },
            })
                .select('firstName lastName personalInfo.dateOfBirth')
                .lean();

            for (const m of assignedMembers) {
                const dob = m.personalInfo?.dateOfBirth;
                if (!dob) continue;
                const bday = new Date(dob);
                const thisYear = new Date(today4.getFullYear(), bday.getMonth(), bday.getDate());
                const diffDays = Math.round(
                    (thisYear.getTime() - today4.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (diffDays >= 0 && diffDays <= 7) {
                    const label =
                        diffDays === 0
                            ? 'today'
                            : diffDays === 1
                            ? 'tomorrow'
                            : `in ${diffDays} days`;
                    upcomingBirthdays.push({
                        name: `${m.firstName} ${m.lastName}`.trim(),
                        date: label,
                    });
                }
            }
        } catch {
            // Graceful fallback
        }

        // ── Average rating ───────────────────────────────────────────────────
        const avgRating = trainerDoc?.ratings?.average || 0;

        res.json({
            todaySessions,
            thisMonthEarnings,
            totalClients,
            attendanceThisMonth,
            pendingSessionLogs: 0,
            upcomingBirthdays,
            avgRating,
            trainerProfile: trainerDoc
                ? {
                      specializations: trainerDoc.specializations,
                      experience: trainerDoc.experience,
                      kpis: trainerDoc.kpis,
                  }
                : null,
        });
    } catch (err: any) {
        console.error('[trainer-dashboard] /my-dashboard error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trainer-dashboard/my-clients
// Members assigned to this trainer
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-clients', async (req: Request, res: Response): Promise<void> => {
    try {
        const userDoc = (req as any).user;
        const tenantId = userDoc.tenantId;

        const Member = require('../models/Member.model').default;
        const Attendance = require('../models/Attendance.model').default;

        const members = await Member.find({
            tenantId,
            'preferences.preferredTrainer': userDoc._id,
        })
            .select('firstName lastName mobile planId membershipExpiry status personalInfo.profilePicture')
            .populate('planId', 'name')
            .lean();

        const enriched = await Promise.all(
            members.map(async (m: any) => {
                let lastSession: string | null = null;
                let totalSessions = 0;
                try {
                    const lastAtt = await Attendance.findOne({ memberId: m._id })
                        .sort({ checkInTime: -1 })
                        .select('checkInTime')
                        .lean();
                    if (lastAtt) {
                        lastSession = (lastAtt as any).checkInTime;
                    }
                    totalSessions = await Attendance.countDocuments({ memberId: m._id });
                } catch {
                    // Graceful fallback
                }

                return {
                    memberId: m._id,
                    name: `${m.firstName} ${m.lastName}`.trim(),
                    phone: m.mobile,
                    planName: (m.planId as any)?.name || 'Unknown',
                    lastSession,
                    totalSessions,
                    photo: m.personalInfo?.profilePicture || null,
                    status: m.status,
                    membershipExpiry: m.membershipExpiry,
                };
            })
        );

        res.json({ clients: enriched, total: enriched.length });
    } catch (err: any) {
        console.error('[trainer-dashboard] /my-clients error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trainer-dashboard/my-schedule
// Trainer's class schedule for the next 7 days
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-schedule', async (req: Request, res: Response): Promise<void> => {
    try {
        const userDoc = (req as any).user;
        const tenantId = userDoc.tenantId;

        const TrainerModel = require('../models/Trainer.model').default;
        const Class = require('../models/Class.model').default;

        const trainerDoc = await TrainerModel.findOne({ userId: userDoc._id, tenantId }).lean();

        if (!trainerDoc) {
            res.json({ schedule: [] });
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next7 = new Date(today);
        next7.setDate(next7.getDate() + 7);

        const allClasses = await Class.find({
            tenantId,
            trainerId: (trainerDoc as any)._id,
            isActive: true,
            isCancelled: false,
            'schedule.startDate': { $lte: next7 },
        })
            .select('name schedule capacity type')
            .lean();

        // Build 7-day schedule
        const days: { date: string; dayLabel: string; sessions: any[] }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dow = d.getDay();
            const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
            const dateStr = d.toISOString().split('T')[0];

            const sessionsForDay = allClasses.filter((cls: any) => {
                const { recurrence, startDate, endDate, daysOfWeek } = cls.schedule;
                const clsStart = new Date(startDate);
                clsStart.setHours(0, 0, 0, 0);
                if (recurrence === 'once') {
                    return clsStart.getTime() === d.getTime();
                }
                if (recurrence === 'daily') {
                    return clsStart <= d && (!endDate || new Date(endDate) >= d);
                }
                if (recurrence === 'weekly') {
                    return Array.isArray(daysOfWeek) && daysOfWeek.includes(dow) && clsStart <= d && (!endDate || new Date(endDate) >= d);
                }
                if (recurrence === 'monthly') {
                    return clsStart.getDate() === d.getDate() && clsStart <= d && (!endDate || new Date(endDate) >= d);
                }
                return false;
            }).map((cls: any) => ({
                classId: cls._id,
                className: cls.name,
                time: cls.schedule.startTime,
                endTime: cls.schedule.endTime,
                enrolled: cls.capacity?.current || 0,
                maxCapacity: cls.capacity?.max || 0,
                type: cls.type,
            }));

            days.push({ date: dateStr, dayLabel, sessions: sessionsForDay });
        }

        res.json({ schedule: days });
    } catch (err: any) {
        console.error('[trainer-dashboard] /my-schedule error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trainer-dashboard/log-session
// Log a completed training session
// ─────────────────────────────────────────────────────────────────────────────
router.post('/log-session', async (req: Request, res: Response): Promise<void> => {
    try {
        const userDoc = (req as any).user;
        const tenantId = userDoc.tenantId;
        const body = req.body;

        // Optionally update attendance record with trainer notes/rating
        if (body.memberId) {
            try {
                const Attendance = require('../models/Attendance.model').default;
                const sessionDate = body.sessionDate ? new Date(body.sessionDate) : new Date();
                const nextDay = new Date(sessionDate);
                nextDay.setDate(nextDay.getDate() + 1);

                await Attendance.findOneAndUpdate(
                    {
                        tenantId,
                        memberId: body.memberId,
                        checkInTime: { $gte: sessionDate, $lt: nextDay },
                    },
                    {
                        $set: {
                            notes: body.notes || '',
                            trainerId: userDoc._id,
                        },
                    },
                    { upsert: false }
                );
            } catch {
                // Non-fatal: attendance record may not exist
            }
        }

        // Optionally push session history to Class
        if (body.classId) {
            try {
                const Class = require('../models/Class.model').default;
                await Class.findByIdAndUpdate(body.classId, {
                    $push: {
                        sessionHistory: {
                            startedAt: body.sessionDate ? new Date(body.sessionDate) : new Date(),
                            endedAt: new Date(),
                            startedBy: userDoc._id,
                            durationMinutes: body.durationMinutes || 60,
                        },
                    },
                });
            } catch {
                // Non-fatal
            }
        }

        res.json({
            success: true,
            message: 'Session logged successfully',
            log: {
                tenantId,
                trainerId: userDoc._id,
                classId: body.classId || null,
                memberId: body.memberId || null,
                sessionDate: body.sessionDate || new Date().toISOString(),
                durationMinutes: body.durationMinutes || 60,
                notes: body.notes || '',
                performanceRating: body.performanceRating || null,
                exercisesCompleted: body.exercisesCompleted || [],
                loggedAt: new Date().toISOString(),
            },
        });
    } catch (err: any) {
        console.error('[trainer-dashboard] /log-session error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trainer-dashboard/my-earnings
// Detailed earnings breakdown (last 6 months)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-earnings', async (req: Request, res: Response): Promise<void> => {
    try {
        const userDoc = (req as any).user;
        const tenantId = userDoc.tenantId;

        const TrainerModel = require('../models/Trainer.model').default;
        const trainerDoc = await TrainerModel.findOne({ userId: userDoc._id, tenantId }).lean();

        const monthlyData: { month: string; amount: number }[] = [];
        let thisMonthTotal = 0;
        let pendingTotal = 0;
        let paidTotal = 0;

        try {
            const TrainerCommission = require('../models/TrainerCommission.model').default;
            const now = new Date();

            // Last 6 months
            for (let i = 5; i >= 0; i--) {
                const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                const label = mStart.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

                const agg = await TrainerCommission.aggregate([
                    {
                        $match: {
                            tenantId,
                            trainerId: trainerDoc?._id ?? userDoc._id,
                            createdAt: { $gte: mStart, $lt: mEnd },
                        },
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]);
                monthlyData.push({ month: label, amount: agg[0]?.total || 0 });
            }

            // This month totals
            const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const thisMonthAgg = await TrainerCommission.aggregate([
                {
                    $match: {
                        tenantId,
                        trainerId: trainerDoc?._id ?? userDoc._id,
                        createdAt: { $gte: mStart },
                    },
                },
                {
                    $group: {
                        _id: '$status',
                        total: { $sum: '$amount' },
                    },
                },
            ]);
            for (const grp of thisMonthAgg) {
                if (grp._id === 'paid') paidTotal = grp.total;
                else pendingTotal += grp.total;
            }
            thisMonthTotal = paidTotal + pendingTotal;
        } catch {
            // Commission model doesn't exist yet — return zeroes
        }

        // Per-client breakdown
        const clientBreakdown: { clientName: string; amount: number; sessions: number }[] = [];
        try {
            const Member = require('../models/Member.model').default;
            const Attendance = require('../models/Attendance.model').default;
            const now = new Date();
            const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

            const clients = await Member.find({
                tenantId,
                'preferences.preferredTrainer': userDoc._id,
            })
                .select('firstName lastName membershipFee')
                .lean();

            for (const c of clients) {
                const sessionCount = await Attendance.countDocuments({
                    tenantId,
                    memberId: c._id,
                    trainerId: userDoc._id,
                    checkInTime: { $gte: mStart },
                });
                if (sessionCount > 0) {
                    clientBreakdown.push({
                        clientName: `${c.firstName} ${c.lastName}`.trim(),
                        amount: 0, // Commission model would have exact figures
                        sessions: sessionCount,
                    });
                }
            }
        } catch {
            // Graceful fallback
        }

        res.json({
            monthlyData,
            thisMonthTotal,
            pendingTotal,
            paidTotal,
            clientBreakdown,
            trainerKpis: trainerDoc
                ? {
                      totalRevenue: (trainerDoc as any).kpis?.totalRevenue || 0,
                      totalSessions: (trainerDoc as any).kpis?.totalSessions || 0,
                  }
                : null,
        });
    } catch (err: any) {
        console.error('[trainer-dashboard] /my-earnings error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trainer-dashboard/my-stats
// Overall trainer performance stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const userDoc = (req as any).user;
        const tenantId = userDoc.tenantId;

        const TrainerModel = require('../models/Trainer.model').default;
        const trainerDoc = await TrainerModel.findOne({ userId: userDoc._id, tenantId }).lean() as any;

        let totalSessionsAllTime = trainerDoc?.kpis?.totalSessions || 0;
        let totalClientsServed = trainerDoc?.kpis?.totalClients || 0;
        const avgSessionRating = trainerDoc?.ratings?.average || 0;
        const retentionRate = trainerDoc?.kpis?.retentionRate || 0;

        // Supplement from Attendance if available
        try {
            const Attendance = require('../models/Attendance.model').default;
            const attCount = await Attendance.countDocuments({
                tenantId,
                trainerId: userDoc._id,
            });
            if (attCount > totalSessionsAllTime) totalSessionsAllTime = attCount;

            const clientCount = await Attendance.distinct('memberId', {
                tenantId,
                trainerId: userDoc._id,
            });
            if (clientCount.length > totalClientsServed) totalClientsServed = clientCount.length;
        } catch {
            // Graceful fallback
        }

        res.json({
            totalSessionsAllTime,
            totalClientsServed,
            avgSessionRating,
            retentionRate,
            joinedDate: (userDoc as any).createdAt || null,
            specializations: trainerDoc?.specializations || [],
            experience: trainerDoc?.experience || null,
            certifications: trainerDoc?.certifications || [],
        });
    } catch (err: any) {
        console.error('[trainer-dashboard] /my-stats error:', err);
        res.status(500).json({ error: 'Internal server error', details: err?.message });
    }
});

export default router;
