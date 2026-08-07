import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Trainer from '../models/Trainer.model';
import Branch from '../models/Branch.model';
import AuditLog from '../models/AuditLog.model';
import Attendance from '../models/Attendance.model';
import Class from '../models/Class.model';
import Expense from '../models/Expense.model';
import StaffAttendance from '../models/StaffAttendance.model';
import { UserRole } from '../models/User.model';
import mongoose from 'mongoose';

class DashboardService {
    async getDataForRole(role: UserRole, userId: string, tenantId: string, branchId?: string) {
        switch (role) {
            case 'gym_owner':
                return this.getGymOwnerStats(tenantId);
            case 'branch_manager':
                return this.getBranchManagerStats(tenantId, branchId!);
            case 'trainer':
                return this.getTrainerStats(tenantId, userId);
            case 'member':
                return this.getMemberStats(tenantId, userId);
            case 'accountant':
                return this.getAccountantStats(tenantId);
            case 'auditor':
                return this.getAuditorStats(tenantId);
            case 'staff':
                return this.getStaffStats(tenantId, branchId);
            default:
                throw new Error('Invalid role for dashboard');
        }
    }

    private async getGymOwnerStats(tenantId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // "Monthly Revenue" is a rolling 30-day window rather than strict calendar
        // month, so a payment from a few days into the previous month still counts
        // (otherwise the dashboard reads as empty for the first days of a new month
        // even for gyms with recent, real revenue).
        const thirtyDaysAgo = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const todayDow = today.getDay();
        // Last 7 days (including today) for the weekly revenue chart, plus the
        // preceding 7 days so we can compute a week-over-week change figure.
        const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);

        const [
            totalMembers,
            activeMembers,
            activeBranches,
            totalRevenue,
            monthlyRevenue,
            todayRevenue,
            todayAttendance,
            todayClasses,
            expiringThisWeek,
            overduePayments,
            weeklyRevenueAgg,
            prevWeekRevenueAgg,
            recentAuditLogs,
        ] = await Promise.all([
            Member.countDocuments({ tenantId }),
            Member.countDocuments({ tenantId, status: 'active' }),
            Branch.countDocuments({ tenantId, isActive: true }),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: today } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Attendance.countDocuments({ tenantId: tenantOid, checkInTime: { $gte: today } }),
            Class.countDocuments({ tenantId, isActive: true, isCancelled: false, 'schedule.daysOfWeek': todayDow }),
            Member.countDocuments({ tenantId, status: 'active', membershipExpiry: { $gte: today, $lte: weekEnd } }),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount.total' }, count: { $sum: 1 } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: sevenDaysAgo } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(8).lean(),
        ]);

        // Build a 7-day (oldest → newest) revenue series, filling in 0 for days with no completed payments
        const dayTotals: Record<string, number> = {};
        (weeklyRevenueAgg as any[]).forEach((d: any) => { dayTotals[d._id] = d.total; });
        const weeklyRevenue: number[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().slice(0, 10);
            weeklyRevenue.push(dayTotals[key] || 0);
        }
        const weeklyTotal = weeklyRevenue.reduce((sum, v) => sum + v, 0);
        const prevWeeklyTotal = prevWeekRevenueAgg[0]?.total || 0;
        let weeklyChange = '';
        if (prevWeeklyTotal > 0) {
            const pct = Math.round(((weeklyTotal - prevWeeklyTotal) / prevWeeklyTotal) * 100);
            weeklyChange = `${pct >= 0 ? '+' : ''}${pct}% vs last week`;
        } else if (weeklyTotal > 0) {
            weeklyChange = 'vs last week';
        }

        const resourceLabel: Record<string, string> = {
            member: 'Member', payment: 'Payment', class: 'Class', trainer: 'Trainer',
            staff: 'Staff', branch: 'Branch', expense: 'Expense',
        };
        const recentActivity = (recentAuditLogs as any[]).map((log: any) => ({
            id: log._id.toString(),
            icon: log.action === 'payment' ? '💰' : log.action === 'delete' ? '🗑️' : log.action === 'create' ? '➕' : '📋',
            title: log.description,
            subtitle: resourceLabel[log.resource] || log.resource || '',
            time: log.createdAt
                ? new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                : '',
        }));

        return {
            stats: {
                totalMembers,
                activeMembers,
                revenue: totalRevenue[0]?.total || 0,
                monthlyRevenue: monthlyRevenue[0]?.total || 0,
                todayRevenue: todayRevenue[0]?.total || 0,
                activeBranches,
                todayAttendance,
                todayClasses,
                expiringThisWeek,
                overdueAmount: overduePayments[0]?.total || 0,
                overdueMembers: overduePayments[0]?.count || 0,
            },
            // Flat aliases consumed by the mobile GymOwnerDashboard screen
            weeklyRevenue,
            weeklyTotal,
            weeklyChange,
            recentActivity,
        };
    }

    private async getMemberStats(tenantId: string, userId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDow = today.getDay();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const weekStart = new Date(today.getTime() - todayDow * 24 * 60 * 60 * 1000);

        const member = await Member.findOne({ tenantId, userId })
            .populate('planId', 'name')
            .lean() as any;

        const [totalAttendance, monthAttendance, weekAttendance, upcomingClasses, recentAttendance] = await Promise.all([
            member ? Attendance.countDocuments({ tenantId: tenantOid, memberId: member._id }) : Promise.resolve(0),
            member ? Attendance.countDocuments({ tenantId: tenantOid, memberId: member._id, checkInTime: { $gte: monthStart } }) : Promise.resolve(0),
            member ? Attendance.countDocuments({ tenantId: tenantOid, memberId: member._id, checkInTime: { $gte: weekStart } }) : Promise.resolve(0),
            Class.find({ tenantId, isActive: true, isCancelled: false, 'schedule.daysOfWeek': todayDow })
                .sort({ 'schedule.startTime': 1 })
                .limit(3)
                .select('name schedule.startTime capacity trainerId')
                .populate({ path: 'trainerId', populate: { path: 'userId', select: 'firstName lastName' } })
                .lean(),
            member
                ? Attendance.find({ tenantId: tenantOid, memberId: member._id }).sort({ checkInTime: -1 }).limit(5).lean()
                : Promise.resolve([]),
        ]);

        const daysRemaining = member?.membershipExpiry
            ? Math.max(0, Math.ceil((new Date(member.membershipExpiry).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
            : 0;

        const nextClassDoc = upcomingClasses[0] as any;
        const trainerDoc = nextClassDoc?.trainerId as any;
        const trainerUser = trainerDoc?.userId as any;

        const recentActivity = (recentAttendance as any[]).map((a: any) => ({
            id: a._id.toString(),
            icon: '✅',
            title: 'Checked in',
            subtitle: '',
            time: new Date(a.checkInTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        }));

        return {
            // Legacy shape — kept for backward compatibility with other consumers
            profile: member,
            metrics: {
                attendanceStreak: (member as any)?.gamification?.currentStreak || 0,
                totalPoints: (member as any)?.gamification?.totalPoints || 0,
                totalAttendance,
                monthAttendance,
                upcomingClasses: upcomingClasses.map((c: any) => ({
                    name: c.name,
                    time: c.schedule?.startTime || '',
                })),
            },
            // Shape consumed by the mobile MemberDashboard screen
            membership: {
                plan: (member as any)?.planId?.name || null,
                expiryDate: member?.membershipExpiry || null,
                daysRemaining,
            },
            stats: {
                streak: (member as any)?.gamification?.currentStreak || 0,
                totalVisits: totalAttendance,
                thisWeek: weekAttendance,
            },
            nextClass: nextClassDoc ? {
                id: nextClassDoc._id.toString(),
                name: nextClassDoc.name,
                time: nextClassDoc.schedule?.startTime || '',
                trainerName: trainerUser ? `${trainerUser.firstName} ${trainerUser.lastName}` : '',
                spotsLeft: nextClassDoc.capacity
                    ? Math.max(0, (nextClassDoc.capacity.max || 0) - (nextClassDoc.capacity.current || 0))
                    : 0,
            } : null,
            recentActivity,
        };
    }

    private async getTrainerStats(tenantId: string, userId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDow = today.getDay();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const trainer = await Trainer.findOne({ tenantId, userId }).lean() as any;
        const trainerId = trainer?._id;

        const [activeMembers, classesToday, todayAttendance, weekSessionsAgg, todaysClassDocs, assignedMembers] = await Promise.all([
            Member.countDocuments({ tenantId, 'preferences.preferredTrainer': userId, status: 'active' }),
            trainerId
                ? Class.countDocuments({ tenantId, trainerId, isActive: true, 'schedule.daysOfWeek': todayDow })
                : Promise.resolve(0),
            Attendance.countDocuments({ tenantId: tenantOid, checkInTime: { $gte: today } }),
            trainerId
                ? Class.aggregate([
                    { $match: { tenantId: tenantOid, trainerId, isActive: true } },
                    { $unwind: '$schedule.daysOfWeek' },
                    { $count: 'total' },
                ])
                : Promise.resolve([]),
            trainerId
                ? Class.find({ tenantId, trainerId, isActive: true, isCancelled: false, 'schedule.daysOfWeek': todayDow })
                    .select('name type schedule')
                    .lean()
                : Promise.resolve([]),
            Member.find({ tenantId, 'preferences.preferredTrainer': userId, status: 'active' })
                .select('firstName lastName')
                .limit(5)
                .lean(),
        ]);

        const weekSessions = (weekSessionsAgg as any[])[0]?.total || 0;
        const rating = trainer?.ratings?.average || 0;

        // Today's schedule — consumed by the mobile TrainerDashboard's "Today's Schedule" list
        const now = new Date();
        const schedule = (todaysClassDocs as any[]).map((cls: any) => {
            const startTime: string = cls.schedule?.startTime || '';
            const endTime: string = cls.schedule?.endTime || '';
            let duration = '';
            const [sh, sm] = startTime.split(':').map(Number);
            const [eh, em] = endTime.split(':').map(Number);
            if (!Number.isNaN(sh) && !Number.isNaN(eh)) {
                const mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
                if (mins > 0) duration = `${mins} min`;
            }
            let status: 'Completed' | 'Upcoming' = 'Upcoming';
            if (!Number.isNaN(eh)) {
                const endDateTime = new Date(today);
                endDateTime.setHours(eh, em || 0, 0, 0);
                if (now > endDateTime) status = 'Completed';
            }
            return {
                id: cls._id.toString(),
                client: cls.name,
                type: cls.type || 'Class',
                duration,
                time: startTime,
                status,
            };
        }).sort((a, b) => a.time.localeCompare(b.time));

        // Client highlights — consumed by the mobile TrainerDashboard's "Client Highlights" list
        const clientAttendanceCounts = await Promise.all(
            (assignedMembers as any[]).map((m: any) =>
                Attendance.countDocuments({ tenantId: tenantOid, memberId: m._id, checkInTime: { $gte: monthStart } })
            )
        );
        const clients = (assignedMembers as any[]).map((m: any, i: number) => {
            const sessions = clientAttendanceCounts[i];
            return {
                id: m._id.toString(),
                name: `${m.firstName} ${m.lastName}`.trim(),
                progress: `${sessions} session${sessions === 1 ? '' : 's'} this month`,
                positive: sessions > 0,
            };
        });

        return {
            stats: {
                activeMembers,
                classesToday,
                todayAttendance,
                rating,
            },
            // Flat aliases consumed by the mobile TrainerDashboard screen
            clientCount: activeMembers,
            todaySessions: classesToday,
            weekSessions,
            rating,
            schedule,
            clients,
        };
    }

    private async getAccountantStats(tenantId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            pendingAgg,
            todayRevenueAgg,
            monthlyRevenueAgg,
            revenueByMethod,
            expensesMTDAgg,
            recentPaymentsRaw,
            recentExpensesRaw,
        ] = await Promise.all([
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount.total' }, count: { $sum: 1 } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: today } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount.total' }, tax: { $sum: '$amount.taxAmount' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: monthStart } } },
                { $group: { _id: '$method', total: { $sum: '$amount.total' }, count: { $sum: 1 } } },
            ]),
            Expense.aggregate([
                { $match: { tenantId: tenantOid, date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            Payment.find({ tenantId: tenantOid, status: 'completed' })
                .sort({ paidAt: -1 })
                .limit(10)
                .populate({ path: 'memberId', select: 'firstName lastName' })
                .lean(),
            Expense.find({ tenantId: tenantOid }).sort({ date: -1 }).limit(10).lean(),
        ]);

        const pendingDues = pendingAgg[0]?.total || 0;
        const pendingCount = pendingAgg[0]?.count || 0;
        const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0;
        const gstCollected = monthlyRevenueAgg[0]?.tax || 0;
        const expensesMTD = expensesMTDAgg[0]?.total || 0;
        const netProfit = monthlyRevenue - expensesMTD;
        const profitMargin = monthlyRevenue > 0 ? (netProfit / monthlyRevenue) * 100 : 0;

        const methodLabel: Record<string, string> = {
            cash: 'Cash', card: 'Card', upi: 'UPI',
            net_banking: 'Net Banking', wallet: 'Wallet', razorpay: 'Razorpay', stripe: 'Stripe',
        };
        const paymentMethods = (revenueByMethod as any[]).map((m: any) => ({
            method: methodLabel[m._id] || m._id || 'Other',
            amount: m.total,
            count: m.count,
        }));

        const paymentTxns = (recentPaymentsRaw as any[]).map((p: any) => {
            const member = p.memberId as any;
            const name = member ? `${member.firstName} ${member.lastName}` : (p.invoiceNumber || 'Payment');
            return {
                id: p._id.toString(),
                title: name,
                subtitle: p.description || p.paymentType,
                amount: p.amount?.total || 0,
                type: 'income',
                createdAt: p.paidAt || p.createdAt,
            };
        });
        const expenseTxns = (recentExpensesRaw as any[]).map((e: any) => ({
            id: e._id.toString(),
            title: e.category,
            subtitle: e.description,
            amount: e.amount,
            type: 'expense',
            createdAt: e.date,
        }));
        const recentTransactions = [...paymentTxns, ...expenseTxns]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10);

        return {
            todayRevenue: todayRevenueAgg[0]?.total || 0,
            monthlyRevenue,
            pendingDues,
            pendingCount,
            expensesMTD,
            netProfit,
            profitMargin,
            gstCollected,
            paymentMethods,
            recentTransactions,
            // Legacy fields — kept for backward compatibility with other consumers
            pendingInvoices: pendingCount,
            totalRevenue: monthlyRevenue,
            totalTax: gstCollected,
            revenueByType: revenueByMethod,
            taxSummary: { gst: '18%', totalTax: gstCollected },
        };
    }

    private async getAuditorStats(tenantId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            totalMembers,
            activeMembers,
            todayAttendance,
            monthlyRevenueAgg,
            pendingDuesAgg,
            totalTransactions,
            recentLogs,
        ] = await Promise.all([
            Member.countDocuments({ tenantId }),
            Member.countDocuments({ tenantId, status: 'active' }),
            Attendance.countDocuments({ tenantId: tenantOid, checkInTime: { $gte: today } }),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.countDocuments({ tenantId: tenantOid, status: 'completed' }),
            AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(10),
        ]);

        return {
            totalMembers,
            activeMembers,
            todayAttendance,
            monthlyRevenue: monthlyRevenueAgg[0]?.total || 0,
            pendingDues: pendingDuesAgg[0]?.total || 0,
            totalTransactions,
            auditLogs: recentLogs,
            systemAlerts: 0,
            dataIntegrity: '100%',
        };
    }

    private async getStaffStats(tenantId: string, branchId?: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const memberFilter: any = { tenantId };
        if (branchId) memberFilter.branchId = branchId;

        const attendanceFilter: any = { tenantId: tenantOid, checkInTime: { $gte: today } };
        if (branchId) attendanceFilter.branchId = new mongoose.Types.ObjectId(branchId);

        const paymentFilter: any = { tenantId: tenantOid, status: 'pending' };
        if (branchId) paymentFilter.branchId = new mongoose.Types.ObjectId(branchId);

        const [
            todayCheckIns,
            newMembers,
            expiringThisWeek,
            pendingPaymentsCount,
            pendingPaymentsRaw,
            recentCheckinsRaw,
        ] = await Promise.all([
            Attendance.countDocuments(attendanceFilter),
            Member.countDocuments({ ...memberFilter, createdAt: { $gte: today } }),
            Member.countDocuments({ ...memberFilter, status: 'active', membershipExpiry: { $gte: today, $lte: weekAhead } }),
            Payment.countDocuments(paymentFilter),
            Payment.find(paymentFilter)
                .sort({ createdAt: -1 })
                .limit(5)
                .populate({ path: 'memberId', select: 'firstName lastName' })
                .lean(),
            Attendance.find(attendanceFilter)
                .sort({ checkInTime: -1 })
                .limit(5)
                .populate({ path: 'memberId', select: 'firstName lastName' })
                .lean(),
        ]);

        const pendingTasksList: { id: string; title: string; subtitle: string; priority: 'High' | 'Medium' | 'Low'; icon: string }[] = [];
        if (expiringThisWeek > 0) {
            pendingTasksList.push({
                id: 'expiring', icon: '⏳', priority: 'High',
                title: `${expiringThisWeek} membership${expiringThisWeek > 1 ? 's' : ''} expiring this week`,
                subtitle: 'Reach out to renew before they lapse',
            });
        }
        if (pendingPaymentsCount > 0) {
            pendingTasksList.push({
                id: 'dues', icon: '💬', priority: 'High',
                title: `${pendingPaymentsCount} member${pendingPaymentsCount > 1 ? 's' : ''} with pending dues`,
                subtitle: 'Send a payment reminder',
            });
        }
        if (newMembers > 0) {
            pendingTasksList.push({
                id: 'new', icon: '👤', priority: 'Medium',
                title: `${newMembers} new member${newMembers > 1 ? 's' : ''} joined today`,
                subtitle: 'Complete onboarding checklist',
            });
        }

        const followUpMembers = (pendingPaymentsRaw as any[]).map((p: any) => {
            const member = p.memberId as any;
            const name = member ? `${member.firstName} ${member.lastName}` : 'Member';
            const daysPending = Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
            return {
                id: member?._id ? member._id.toString() : p._id.toString(),
                name,
                reason: daysPending > 0 ? `Payment pending ${daysPending} day${daysPending === 1 ? '' : 's'}` : 'Payment pending',
                icon: '❗',
            };
        });

        const activityFeed = (recentCheckinsRaw as any[]).map((a: any) => {
            const member = a.memberId as any;
            const name = member ? `${member.firstName} ${member.lastName}` : 'A member';
            return {
                id: a._id.toString(),
                text: `${name} checked in`,
                time: new Date(a.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                icon: '✅',
            };
        });

        return {
            todayCheckIns,
            newMembers,
            pendingTasks: pendingTasksList.length,
            followUps: pendingPaymentsCount,
            pendingTasksList,
            followUpMembers,
            activityFeed,
        };
    }

    private async getBranchManagerStats(tenantId: string, branchId: string) {
        const branchMembers = await Member.countDocuments({ tenantId, branchId });
        return {
            stats: {
                totalMembers: branchMembers,
                branchStatus: 'Operational',
                occupancy: '75%'
            }
        };
    }

    async getBranchStats(tenantId: string, branchId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const branchOid = new mongoose.Types.ObjectId(branchId);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const todayDow = todayStart.getDay(); // 0=Sun, 1=Mon, ...

        const sevenDaysLater = new Date(todayStart);
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

        const methodLabel: Record<string, string> = {
            manual: 'Manual', qr: 'QR', rfid: 'RFID',
            biometric: 'Biometric', mobile_app: 'Mobile',
        };

        const [
            todayCheckinCount,
            activeMembers,
            activeTrainers,
            recentCheckins,
            todaysClasses,
            expiringToday,
            expiringSoon,
            branchDoc,
            todayRevenueAgg,
            pendingDuesAgg,
            staffOnDutyRaw,
        ] = await Promise.all([
            Attendance.countDocuments({ tenantId: tenantOid, branchId: branchOid, checkInTime: { $gte: todayStart } }),
            Member.countDocuments({ tenantId, branchId, status: 'active' }),
            Trainer.countDocuments({ tenantId, branchId, isActive: true }),
            Attendance.find({ tenantId: tenantOid, branchId: branchOid, checkInTime: { $gte: todayStart } })
                .sort({ checkInTime: -1 })
                .limit(10)
                .populate({ path: 'memberId', select: 'firstName lastName' })
                .lean(),
            Class.find({ tenantId, branchId, isActive: true, isCancelled: false, 'schedule.daysOfWeek': todayDow })
                .populate({ path: 'trainerId', populate: { path: 'userId', select: 'firstName lastName' } })
                .lean(),
            Member.countDocuments({ tenantId, branchId, status: 'active', membershipExpiry: { $gte: todayStart, $lt: new Date(todayStart.getTime() + 86400000) } }),
            Member.countDocuments({ tenantId, branchId, status: 'active', membershipExpiry: { $gte: new Date(todayStart.getTime() + 86400000), $lt: sevenDaysLater } }),
            Branch.findById(branchOid).select('name').lean(),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, branchId: branchOid, status: 'completed', paidAt: { $gte: todayStart } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, branchId: branchOid, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            StaffAttendance.find({ tenantId: tenantOid, branchId: branchOid, date: { $gte: todayStart, $lt: todayEnd } })
                .populate({ path: 'staffId', select: 'firstName lastName role' })
                .lean(),
        ]);

        const classesToday = todaysClasses.length;

        const recentCheckinsFormatted = recentCheckins.map((a: any) => {
            const member = a.memberId as any;
            const name = member ? `${member.firstName} ${member.lastName}` : 'Unknown';
            const checkIn = new Date(a.checkInTime);
            const time = checkIn.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            return { name, time, method: methodLabel[a.method] || a.method };
        });

        const classesFormatted = todaysClasses.map((cls: any) => {
            const trainerDoc = cls.trainerId as any;
            const trainerUser = trainerDoc?.userId as any;
            const trainerName = trainerUser ? `${trainerUser.firstName} ${trainerUser.lastName}` : 'Trainer';
            return {
                id: cls._id.toString(),
                name: cls.name,
                trainer: trainerName,
                time: cls.schedule?.startTime || '',
                capacity: cls.capacity?.max || 0,
                booked: cls.capacity?.current || 0,
                enrolled: cls.capacity?.current || 0,
            };
        });

        const staffOnDuty = (staffOnDutyRaw as any[]).map((a: any) => {
            const staffUser = a.staffId as any;
            const name = staffUser ? `${staffUser.firstName} ${staffUser.lastName}` : 'Staff';
            const role = staffUser?.role ? String(staffUser.role).replace(/_/g, ' ') : 'Staff';
            const clockInTime = new Date(a.clockIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            const clockOutTime = a.clockOut
                ? new Date(a.clockOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                : null;
            return {
                id: staffUser?._id ? staffUser._id.toString() : a._id.toString(),
                name,
                role,
                status: a.clockOut ? 'Off' : 'Active',
                shift: clockOutTime ? `${clockInTime} – ${clockOutTime}` : `${clockInTime} – now`,
            };
        });

        const pendingTasks: { task: string; priority: 'high' | 'medium' | 'low'; due: string }[] = [];
        if (expiringToday > 0) pendingTasks.push({ task: `${expiringToday} member${expiringToday > 1 ? 's' : ''} expiring today — renew now`, priority: 'high', due: 'Today' });
        if (expiringSoon > 0) pendingTasks.push({ task: `${expiringSoon} membership${expiringSoon > 1 ? 's' : ''} expiring in 7 days`, priority: 'medium', due: 'This Week' });
        if (classesToday === 0) pendingTasks.push({ task: 'No classes scheduled — update class timetable', priority: 'low', due: 'This Week' });

        return {
            stats: {
                todayCheckins: todayCheckinCount,
                activeMembers,
                classesToday,
                activeTrainers,
            },
            // Flat aliases consumed by the mobile BranchManagerDashboard screen
            branchName: (branchDoc as any)?.name || null,
            todayAttendance: todayCheckinCount,
            todayRevenue: todayRevenueAgg[0]?.total || 0,
            pendingDues: pendingDuesAgg[0]?.total || 0,
            activeMembers,
            staffOnDuty,
            upcomingClasses: classesFormatted,
            recentCheckins: recentCheckinsFormatted,
            todaysClasses: classesFormatted,
            pendingTasks,
        };
    }
}

export default new DashboardService();
