import { Request, Response, NextFunction } from 'express';
import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Attendance from '../models/Attendance.model';
import Subscription from '../models/Subscription.model';
import Class from '../models/Class.model';

export class DashboardController {
    // Get overview dashboard for gym owner/branch manager
    async getOverview(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString();

            const filter: any = { tenantId };
            if (branchId && req.user?.role !== 'gym_owner') {
                filter.branchId = branchId;
            }

            // Get current date ranges
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

            // Member statistics
            const [totalMembers, activeMembers, newMembersThisMonth] = await Promise.all([
                Member.countDocuments(filter),
                Member.countDocuments({ ...filter, status: 'active' }),
                Member.countDocuments({
                    ...filter,
                    createdAt: { $gte: thisMonthStart, $lt: nextMonthStart },
                }),
            ]);

            // Revenue statistics
            const revenueThisMonth = await Payment.aggregate([
                {
                    $match: {
                        tenantId: filter.tenantId,
                        ...(filter.branchId && { branchId: filter.branchId }),
                        status: 'completed',
                        createdAt: { $gte: thisMonthStart, $lt: nextMonthStart },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' },
                    },
                },
            ]);

            // Attendance today
            const [attendanceToday, currentlyInGym] = await Promise.all([
                Attendance.countDocuments({
                    ...filter,
                    checkInTime: { $gte: today, $lt: tomorrow },
                }),
                Attendance.countDocuments({
                    ...filter,
                    checkInTime: { $gte: today },
                    checkOutTime: null,
                }),
            ]);

            // Expiring subscriptions (next 7 days)
            const next7Days = new Date(today);
            next7Days.setDate(next7Days.getDate() + 7);

            const expiringSubscriptions = await Subscription.countDocuments({
                ...filter,
                status: 'active',
                endDate: { $gte: today, $lte: next7Days },
            });

            // Upcoming classes today
            const upcomingClassesToday = await Class.countDocuments({
                ...filter,
                'schedule.startTime': { $gte: today, $lt: tomorrow },
                status: 'active',
            });

            return res.status(200).json({
                success: true,
                data: {
                    members: {
                        total: totalMembers,
                        active: activeMembers,
                        newThisMonth: newMembersThisMonth,
                    },
                    revenue: {
                        thisMonth: revenueThisMonth[0]?.total || 0,
                    },
                    attendance: {
                        today: attendanceToday,
                        currentlyInGym,
                    },
                    subscriptions: {
                        expiringSoon: expiringSubscriptions,
                    },
                    classes: {
                        upcomingToday: upcomingClassesToday,
                    },
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // Get member-specific dashboard
    async getMemberDashboard(req: Request, res: Response, next: NextFunction) {
        try {
            const memberId = req.user?.role === 'member' ? req.user?._id.toString() : req.params.memberId;
            const tenantId = req.user?.tenantId?.toString() || '';

            if (!memberId) {
                return res.status(400).json({ success: false, message: 'Member ID is required' });
            }

            const member = await Member.findOne({ _id: memberId, tenantId }).populate('userId');
            if (!member) {
                return res.status(404).json({ success: false, message: 'Member not found' });
            }

            // Active subscription
            const activeSubscription = await Subscription.findOne({
                memberId,
                tenantId,
                status: 'active',
            }).populate('planId');

            // Attendance this month
            const thisMonthStart = new Date();
            thisMonthStart.setDate(1);
            thisMonthStart.setHours(0, 0, 0, 0);

            const attendanceThisMonth = await Attendance.countDocuments({
                memberId,
                tenantId,
                checkInTime: { $gte: thisMonthStart },
            });

            // Upcoming bookings
            const upcomingBookings = await Class.find({
                tenantId,
                'schedule.startTime': { $gte: new Date() },
            })
                .limit(5)
                .sort({ 'schedule.startTime': 1 });

            return res.status(200).json({
                success: true,
                data: {
                    member: {
                        name: `${(member as any).userId?.firstName} ${(member as any).userId?.lastName}`,
                        membershipNumber: member.membershipNumber,
                        status: member.status,
                    },
                    subscription: activeSubscription,
                    attendance: {
                        thisMonth: attendanceThisMonth,
                    },
                    upcomingBookings,
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // Get trainer dashboard
    async getTrainerDashboard(req: Request, res: Response, next: NextFunction) {
        try {
            const trainerId = req.user?._id.toString();
            const tenantId = req.user?.tenantId?.toString() || '';

            if (!trainerId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Classes today
            const classesToday = await Class.find({
                tenantId,
                trainerId,
                'schedule.startTime': { $gte: today, $lt: tomorrow },
            }).populate('bookings');

            // Total active clients
            const activeClients = await Class.distinct('bookings.memberId', {
                tenantId,
                trainerId,
                status: 'active',
            });

            return res.status(200).json({
                success: true,
                data: {
                    classesToday: classesToday.length,
                    activeClients: activeClients.length,
                    todaySchedule: classesToday,
                },
            });
        } catch (error) {
            return next(error);
        }
    }
}

export default new DashboardController();
