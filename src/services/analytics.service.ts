import Payment from '../models/Payment.model';
import Subscription from '../models/Subscription.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Class from '../models/Class.model';
import Trainer from '../models/Trainer.model';
import mongoose from 'mongoose';

export class AnalyticsService {
    // Revenue analytics
    async getRevenueAnalytics(
        tenantId: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const tObjId = new mongoose.Types.ObjectId(tenantId);
        const aggFilter: any = { tenantId: tObjId, status: 'completed' };
        if (branchId) aggFilter.branchId = new mongoose.Types.ObjectId(branchId);
        if (startDate || endDate) {
            aggFilter.paidAt = {};
            if (startDate) aggFilter.paidAt.$gte = startDate;
            if (endDate) aggFilter.paidAt.$lte = endDate;
        }

        const totalRevenue = await Payment.aggregate([
            { $match: aggFilter },
            { $group: { _id: null, total: { $sum: '$amount.total' } } },
        ]);

        const revenueByType = await Payment.aggregate([
            { $match: aggFilter },
            {
                $group: {
                    _id: '$paymentType',
                    total: { $sum: '$amount.total' },
                    count: { $sum: 1 },
                },
            },
        ]);

        const revenueByMonth = await Payment.aggregate([
            { $match: aggFilter },
            {
                $group: {
                    _id: {
                        year: { $year: '$paidAt' },
                        month: { $month: '$paidAt' },
                    },
                    total: { $sum: '$amount.total' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        return {
            totalRevenue: totalRevenue[0]?.total || 0,
            byType: revenueByType,
            byMonth: revenueByMonth,
        };
    }

    // Member retention analytics
    async getRetentionAnalytics(tenantId: string, branchId?: string): Promise<any> {
        const tObjId = new mongoose.Types.ObjectId(tenantId);
        const filter: any = { tenantId };
        const aggFilter: any = { tenantId: tObjId };
        if (branchId) {
            filter.branchId = branchId;
            aggFilter.branchId = new mongoose.Types.ObjectId(branchId);
        }

        const totalMembers = await Member.countDocuments(filter);
        const activeMembers = await Member.countDocuments({ ...filter, status: 'active' });
        const pausedMembers = await Member.countDocuments({ ...filter, status: 'paused' });
        const expiredMembers = await Member.countDocuments({ ...filter, status: 'expired' });
        const cancelledMembers = await Member.countDocuments({ ...filter, status: 'cancelled' });

        const retentionRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100).toFixed(2) : '0';
        const churnRate = totalMembers > 0 ? (((cancelledMembers + expiredMembers) / totalMembers) * 100).toFixed(2) : '0';

        const newMembersByMonth = await Member.aggregate([
            { $match: aggFilter },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 },
        ]);

        return {
            totalMembers,
            activeMembers,
            pausedMembers,
            expiredMembers,
            cancelledMembers,
            retentionRate: parseFloat(retentionRate),
            churnRate: parseFloat(churnRate),
            newMembersByMonth,
        };
    }

    // Attendance analytics
    async getAttendanceAnalytics(
        tenantId: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const tObjId = new mongoose.Types.ObjectId(tenantId);
        const filter: any = { tenantId };
        const aggFilter: any = { tenantId: tObjId };
        if (branchId) {
            filter.branchId = branchId;
            aggFilter.branchId = new mongoose.Types.ObjectId(branchId);
        }
        if (startDate || endDate) {
            const timeFilter: any = {};
            if (startDate) timeFilter.$gte = startDate;
            if (endDate) timeFilter.$lte = endDate;
            filter.checkInTime = timeFilter;
            aggFilter.checkInTime = timeFilter;
        }

        const totalCheckIns = await Attendance.countDocuments(filter);
        const uniqueMembers = await Attendance.distinct('memberId', filter);

        const peakHours = await Attendance.aggregate([
            { $match: aggFilter },
            {
                $group: {
                    _id: {
                        hour: { $hour: '$checkInTime' },
                        dayOfWeek: { $dayOfWeek: '$checkInTime' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]);

        const dailyTrend = await Attendance.aggregate([
            { $match: aggFilter },
            {
                $group: {
                    _id: {
                        year: { $year: '$checkInTime' },
                        month: { $month: '$checkInTime' },
                        day: { $dayOfMonth: '$checkInTime' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        const avgDuration = await Attendance.aggregate([
            { $match: { ...aggFilter, duration: { $exists: true } } },
            { $group: { _id: null, avg: { $avg: '$duration' } } },
        ]);

        return {
            totalCheckIns,
            uniqueMembers: uniqueMembers.length,
            peakHours,
            dailyTrend,
            averageDuration: avgDuration[0]?.avg || 0,
            averagePerDay: dailyTrend.length > 0 ? Math.round(totalCheckIns / dailyTrend.length) : 0,
        };
    }

    // Class utilization analytics
    async getClassUtilization(
        tenantId: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const filter: any = { tenantId, isActive: true };
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter['schedule.startTime'] = {};
            if (startDate) filter['schedule.startTime'].$gte = startDate;
            if (endDate) filter['schedule.startTime'].$lte = endDate;
        }

        const classes = await Class.find(filter).populate('trainerId', 'firstName lastName');

        const utilization = classes.map(cls => ({
            className: cls.name,
            trainer: cls.trainerId,
            capacity: cls.capacity.max,
            enrolled: cls.capacity.current,
            utilizationRate: ((cls.capacity.current / cls.capacity.max) * 100).toFixed(2),
            startTime: cls.schedule.startTime,
        }));

        const avgUtilizationStr = utilization.length > 0
            ? (utilization.reduce((sum, u) => sum + parseFloat(u.utilizationRate), 0) / utilization.length).toFixed(2)
            : '0';

        return {
            totalClasses: classes.length,
            averageUtilization: parseFloat(avgUtilizationStr),
            classes: utilization,
        };
    }

    // Trainer productivity
    async getTrainerProductivity(
        tenantId: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const filter: any = { tenantId, isActive: true };
        if (branchId) filter.branchId = branchId;

        const trainers = await Trainer.find(filter).populate('userId', 'firstName lastName');

        const productivity = await Promise.all(
            trainers.map(async trainer => {
                // Count classes
                const classFilter: any = { trainerId: trainer._id };
                if (startDate || endDate) {
                    classFilter['schedule.startTime'] = {};
                    if (startDate) classFilter['schedule.startTime'].$gte = startDate;
                    if (endDate) classFilter['schedule.startTime'].$lte = endDate;
                }

                const classCount = await Class.countDocuments(classFilter);

                return {
                    trainer: trainer.userId,
                    specializations: trainer.specializations,
                    classCount,
                    rating: trainer.ratings.average,
                    totalRatings: trainer.ratings.totalReviews,
                };
            })
        );

        return {
            totalTrainers: trainers.length,
            productivity: productivity.sort((a, b) => b.classCount - a.classCount),
        };
    }

    // Dashboard overview — returns full nested structure for GymOwnerDashboard
    async getDashboardOverview(tenantId: string, branchId?: string): Promise<any> {
        const tObjId = new mongoose.Types.ObjectId(tenantId);
        const filter: any = { tenantId };
        const aggFilter: any = { tenantId: tObjId };
        if (branchId) {
            filter.branchId = branchId;
            aggFilter.branchId = new mongoose.Types.ObjectId(branchId);
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1);

        const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        const [
            totalMembers,
            activeMembers,
            pausedMembers,
            expiredMembers,
            archivedMembers,
            todayAttendance,
            activeSubscriptions,
            newThisMonth,
            newPrevMonth,
            monthlyRevResult,
            prevMonthRevResult,
            revenueByMonth,
            subRevenueResult,
            topTrainerDocs,
            classesByCategory,
        ] = await Promise.all([
            Member.countDocuments(filter),
            Member.countDocuments({ ...filter, status: 'active' }),
            Member.countDocuments({ ...filter, status: 'paused' }),
            Member.countDocuments({ ...filter, status: 'expired' }),
            Member.countDocuments({ ...filter, status: 'archived' }),
            Attendance.countDocuments({ ...aggFilter, checkInTime: { $gte: today } }),
            Subscription.countDocuments({ ...filter, status: 'active' }),
            Member.countDocuments({ ...filter, createdAt: { $gte: monthStart } }),
            Member.countDocuments({ ...filter, createdAt: { $gte: prevMonthStart, $lt: monthStart } }),
            Payment.aggregate([{ $match: { ...aggFilter, status: 'completed', paidAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount.total' } } }]),
            Payment.aggregate([{ $match: { ...aggFilter, status: 'completed', paidAt: { $gte: prevMonthStart, $lt: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount.total' } } }]),
            Payment.aggregate([
                { $match: { ...aggFilter, status: 'completed', paidAt: { $gte: twelveMonthsAgo } } },
                { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, total: { $sum: '$amount.total' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            Payment.aggregate([{ $match: { ...aggFilter, status: 'completed', paymentType: 'subscription' } }, { $group: { _id: null, total: { $sum: '$amount.total' } } }]),
            Trainer.find({ ...filter, isActive: true }).populate('userId', 'firstName lastName').lean(),
            Class.aggregate([{ $match: aggFilter }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);

        const thisMonthRev = monthlyRevResult[0]?.total || 0;
        const prevMonthRev = prevMonthRevResult[0]?.total || 0;
        const revenueGrowth = prevMonthRev > 0 ? parseFloat((((thisMonthRev - prevMonthRev) / prevMonthRev) * 100).toFixed(1)) : 0;
        const totalRev = revenueByMonth.reduce((s: number, r: any) => s + r.total, 0);
        const history = revenueByMonth.map((r: any) => ({
            date: `${MONTH_NAMES[r._id.month - 1]} ${r._id.year}`,
            amount: r.total,
        }));

        const retentionRate = totalMembers > 0 ? parseFloat(((activeMembers / totalMembers) * 100).toFixed(1)) : 0;
        const churnRate = totalMembers > 0 ? parseFloat((((archivedMembers + expiredMembers) / totalMembers) * 100).toFixed(1)) : 0;

        const topTrainers = topTrainerDocs.slice(0, 6).map((t: any) => {
            const u = t.userId as any;
            return {
                trainerId: t._id,
                trainerName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
                specializations: t.specializations || [],
                rating: t.ratings?.average ?? 0,
                classesConducted: t.kpis?.totalSessions ?? 0,
                avgAttendance: t.kpis?.retentionRate ?? 0,
                revenueGenerated: t.kpis?.totalRevenue ?? 0,
                activeClients: t.kpis?.activeClients ?? 0,
            };
        });

        return {
            overview: {
                totalMembers,
                activeMembers,
                pausedMembers,
                expiredMembers,
                todayAttendance,
                activeSubscriptions,
                newThisMonth,
            },
            revenue: {
                totalRevenue: totalRev,
                thisMonth: thisMonthRev,
                growth: revenueGrowth,
                history,
                subscriptionRevenue: subRevenueResult[0]?.total || 0,
                posRevenue: 0,
            },
            retention: {
                totalMembers,
                activeMembers,
                retentionRate,
                churnRate,
                newSignups: newThisMonth,
                newPrevMonth,
            },
            engagement: {
                appUsageStats: classesByCategory.map((c: any) => ({ feature: c._id || 'general', count: c.count })),
                activeThisMonth: activeMembers,
            },
            topTrainers,
        };
    }
}

export default new AnalyticsService();
