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
        const filter: any = { tenantId, status: 'completed' };
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter.paidAt = {};
            if (startDate) filter.paidAt.$gte = startDate;
            if (endDate) filter.paidAt.$lte = endDate;
        }

        const totalRevenue = await Payment.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);

        const revenueByType = await Payment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$paymentType',
                    total: { $sum: '$totalAmount' },
                    count: { $sum: 1 },
                },
            },
        ]);

        const revenueByMonth = await Payment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        year: { $year: '$paidAt' },
                        month: { $month: '$paidAt' },
                    },
                    total: { $sum: '$totalAmount' },
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
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const totalMembers = await Member.countDocuments(filter);
        const activeMembers = await Member.countDocuments({ ...filter, status: 'active' });
        const pausedMembers = await Member.countDocuments({ ...filter, status: 'paused' });
        const expiredMembers = await Member.countDocuments({ ...filter, status: 'expired' });
        const cancelledMembers = await Member.countDocuments({ ...filter, status: 'cancelled' });

        const retentionRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100).toFixed(2) : '0';
        const churnRate = totalMembers > 0 ? (((cancelledMembers + expiredMembers) / totalMembers) * 100).toFixed(2) : '0';

        // New members by month
        const newMembersByMonth = await Member.aggregate([
            { $match: filter },
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
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter.checkInTime = {};
            if (startDate) filter.checkInTime.$gte = startDate;
            if (endDate) filter.checkInTime.$lte = endDate;
        }

        const totalCheckIns = await Attendance.countDocuments(filter);
        const uniqueMembers = await Attendance.distinct('memberId', filter);

        // Peak hours heatmap
        const peakHours = await Attendance.aggregate([
            { $match: filter },
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

        // Daily attendance trend
        const dailyTrend = await Attendance.aggregate([
            { $match: filter },
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

        // Average duration
        const avgDuration = await Attendance.aggregate([
            { $match: { ...filter, duration: { $exists: true } } },
            { $group: { _id: null, avg: { $avg: '$duration' } } },
        ]);

        return {
            totalCheckIns,
            uniqueMembers: uniqueMembers.length,
            peakHours,
            dailyTrend,
            averageDuration: avgDuration[0]?.avg || 0,
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

    // Dashboard overview
    async getDashboardOverview(tenantId: string, branchId?: string): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalMembers,
            activeMembers,
            todayAttendance,
            monthlyRevenue,
            activeSubscriptions,
        ] = await Promise.all([
            Member.countDocuments(filter),
            Member.countDocuments({ ...filter, status: 'active' }),
            Attendance.countDocuments({
                ...filter,
                checkInTime: { $gte: today },
            }),
            Payment.aggregate([
                {
                    $match: {
                        ...filter,
                        status: 'completed',
                        paidAt: {
                            $gte: new Date(today.getFullYear(), today.getMonth(), 1),
                        },
                    },
                },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ]),
            Subscription.countDocuments({
                ...filter,
                status: 'active',
            }),
        ]);

        return {
            totalMembers,
            activeMembers,
            todayAttendance,
            monthlyRevenue: monthlyRevenue[0]?.total || 0,
            activeSubscriptions,
        };
    }
}

export default new AnalyticsService();
