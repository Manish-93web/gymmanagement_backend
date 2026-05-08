import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Trainer from '../models/Trainer.model';
import Branch from '../models/Branch.model';
import AuditLog from '../models/AuditLog.model';
import Attendance from '../models/Attendance.model';
import Class from '../models/Class.model';
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
            default:
                throw new Error('Invalid role for dashboard');
        }
    }

    private async getGymOwnerStats(tenantId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            totalMembers,
            activeMembers,
            activeBranches,
            totalRevenue,
            monthlyRevenue,
            todayAttendance,
        ] = await Promise.all([
            Member.countDocuments({ tenantId }),
            Member.countDocuments({ tenantId, status: 'active' }),
            Branch.countDocuments({ tenantId, isActive: true }),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed', paidAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]),
            Attendance.countDocuments({ tenantId: tenantOid, checkInTime: { $gte: today } }),
        ]);

        return {
            stats: {
                totalMembers,
                activeMembers,
                revenue: totalRevenue[0]?.total || 0,
                monthlyRevenue: monthlyRevenue[0]?.total || 0,
                activeBranches,
                todayAttendance,
            }
        };
    }

    private async getMemberStats(tenantId: string, userId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDow = today.getDay();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const member = await Member.findOne({ tenantId, userId }).lean() as any;

        const [totalAttendance, monthAttendance, upcomingClasses] = await Promise.all([
            member ? Attendance.countDocuments({ tenantId: tenantOid, memberId: member._id }) : Promise.resolve(0),
            member ? Attendance.countDocuments({ tenantId: tenantOid, memberId: member._id, checkInTime: { $gte: monthStart } }) : Promise.resolve(0),
            Class.find({ tenantId, isActive: true, isCancelled: false, 'schedule.daysOfWeek': todayDow })
                .sort({ 'schedule.startTime': 1 })
                .limit(3)
                .select('name schedule.startTime')
                .lean(),
        ]);

        return {
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
            }
        };
    }

    private async getTrainerStats(tenantId: string, userId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDow = today.getDay();

        const trainer = await Trainer.findOne({ tenantId, userId }).lean() as any;
        const trainerId = trainer?._id;

        const [activeMembers, classesToday, todayAttendance] = await Promise.all([
            Member.countDocuments({ tenantId, 'preferences.preferredTrainer': userId, status: 'active' }),
            trainerId
                ? Class.countDocuments({ tenantId, trainerId, isActive: true, 'schedule.daysOfWeek': todayDow })
                : Promise.resolve(0),
            Attendance.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), checkInTime: { $gte: today } }),
        ]);

        return {
            stats: {
                activeMembers,
                classesToday,
                todayAttendance,
                rating: trainer?.ratings?.average || 0,
            }
        };
    }

    private async getAccountantStats(tenantId: string) {
        const tenantOid = new mongoose.Types.ObjectId(tenantId);

        const [pendingPayments, totalRevenue, monthlyRevenue, revenueByType] = await Promise.all([
            Payment.countDocuments({ tenantId, status: 'pending' }),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount.total' }, tax: { $sum: '$amount.taxAmount' } } },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed' } },
                {
                    $group: {
                        _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } },
                        total: { $sum: '$amount.total' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
                { $limit: 12 },
            ]),
            Payment.aggregate([
                { $match: { tenantId: tenantOid, status: 'completed' } },
                { $group: { _id: '$paymentType', total: { $sum: '$amount.total' }, count: { $sum: 1 } } },
            ]),
        ]);

        return {
            pendingInvoices: pendingPayments,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalTax: totalRevenue[0]?.tax || 0,
            revenueChart: monthlyRevenue,
            revenueByType,
            taxSummary: { gst: '18%', totalTax: totalRevenue[0]?.tax || 0 },
        };
    }

    private async getAuditorStats(tenantId: string) {
        const recentLogs = await AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(10);
        return {
            auditLogs: recentLogs,
            systemAlerts: 0,
            dataIntegrity: '100%'
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
            Member.countDocuments({ tenantId, branchId, status: 'active', expiryDate: { $gte: todayStart, $lt: new Date(todayStart.getTime() + 86400000) } }),
            Member.countDocuments({ tenantId, branchId, status: 'active', expiryDate: { $gte: new Date(todayStart.getTime() + 86400000), $lt: sevenDaysLater } }),
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
                name: cls.name,
                trainer: trainerName,
                time: cls.schedule?.startTime || '',
                capacity: cls.capacity?.max || 0,
                booked: cls.capacity?.current || 0,
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
            recentCheckins: recentCheckinsFormatted,
            todaysClasses: classesFormatted,
            pendingTasks,
        };
    }
}

export default new DashboardService();
