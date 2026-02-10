import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Branch from '../models/Branch.model';
import mongoose from 'mongoose';

export class FranchiseService {
    async getBranchComparison(tenantId: string, period: string = 'last_30_days'): Promise<any> {
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

        // Define date range
        const now = new Date();
        let startDate = new Date();
        if (period === 'last_30_days') startDate.setDate(now.getDate() - 30);
        else if (period === 'last_90_days') startDate.setDate(now.getDate() - 90);
        else startDate.setMonth(now.getMonth() - 12); // year

        // 1. Revenue by Branch
        const revenueByBranch = await Payment.aggregate([
            {
                $match: {
                    tenantId: tenantObjectId,
                    status: 'completed',
                    paidAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$branchId',
                    totalRevenue: { $sum: '$totalAmount' },
                    transactionCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'branches',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'branchInfo'
                }
            },
            { $unwind: '$branchInfo' },
            {
                $project: {
                    branchName: '$branchInfo.name',
                    branchCode: '$branchInfo.code',
                    totalRevenue: 1,
                    transactionCount: 1,
                    averageTransaction: { $divide: ['$totalRevenue', '$transactionCount'] }
                }
            }
        ]);

        // 2. Member Count by Branch
        const membersByBranch = await Member.aggregate([
            { $match: { tenantId: tenantObjectId, isActive: true } },
            {
                $group: {
                    _id: '$branchId',
                    memberCount: { $sum: 1 },
                    activeSubscribers: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            }
        ]);

        // 3. Attendance by Branch
        const attendanceByBranch = await Attendance.aggregate([
            {
                $match: {
                    tenantId: tenantObjectId,
                    checkInTime: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$branchId',
                    totalCheckIns: { $sum: 1 }
                }
            }
        ]);

        // Merge data
        const comparison = revenueByBranch.map(rev => {
            const memberData = membersByBranch.find(m => m._id.toString() === rev._id.toString());
            const attendData = attendanceByBranch.find(a => a._id.toString() === rev._id.toString());

            return {
                ...rev,
                memberCount: memberData?.memberCount || 0,
                activeSubscribers: memberData?.activeSubscribers || 0,
                totalCheckIns: attendData?.totalCheckIns || 0,
                revenuePerMember: memberData?.memberCount ? rev.totalRevenue / memberData.memberCount : 0
            };
        });

        return comparison.sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    async getPerformanceRanking(tenantId: string): Promise<any> {
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

        // Calculate scores based on Growth, Retention, and Revenue
        const branches = await Branch.find({ tenantId: tenantObjectId, isActive: true });

        const rankings = await Promise.all(branches.map(async (branch) => {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const [revenue, members, attendance] = await Promise.all([
                Payment.aggregate([
                    { $match: { branchId: branch._id, status: 'completed', paidAt: { $gte: lastMonth } } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                ]),
                Member.countDocuments({ branchId: branch._id, status: 'active' }),
                Attendance.countDocuments({ branchId: branch._id, checkInTime: { $gte: lastMonth } })
            ]);

            // Simple scoring logic (mocked complexity)
            const revScore = (revenue[0]?.total || 0) / 1000;
            const memScore = members / 10;
            const attScore = attendance / 50;
            const totalScore = revScore + memScore + attScore;

            return {
                branchId: branch._id,
                branchName: branch.name,
                scores: {
                    revenue: revScore,
                    members: memScore,
                    attendance: attScore
                },
                totalScore: parseFloat(totalScore.toFixed(2))
            };
        }));

        return rankings.sort((a, b) => b.totalScore - a.totalScore);
    }
}

export default new FranchiseService();
