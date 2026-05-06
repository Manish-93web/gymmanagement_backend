import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Workout from '../models/Workout.model';
import logger from '../config/logger';

export interface LeaderboardEntry {
    rank: number;
    memberId: string;
    name: string;
    profilePicture?: string;
    value: number;
    change?: number; // Position change from last week
}

class LeaderboardService {
    /**
     * Get attendance leaderboard
     */
    async getAttendanceLeaderboard(
        tenantId: string,
        scope: 'gym' | 'branch' | 'global' = 'gym',
        period: 'week' | 'month' | 'all_time' = 'month',
        branchId?: string,
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const dateFilter = this.getDateFilter(period);

        const query: any = {};
        if (scope === 'branch' && branchId) {
            query.branchId = branchId;
        } else if (scope === 'gym') {
            query.tenantId = tenantId;
        }

        if (dateFilter) {
            query.checkInTime = dateFilter;
        }

        const attendanceCounts = await Attendance.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$memberId',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: limit },
        ]);

        const leaderboard: LeaderboardEntry[] = [];

        for (let i = 0; i < attendanceCounts.length; i++) {
            const entry = attendanceCounts[i];
            const member = await Member.findById(entry._id).select('firstName lastName profilePicture');

            if (member) {
                leaderboard.push({
                    rank: i + 1,
                    memberId: entry._id.toString(),
                    name: `${member.firstName} ${member.lastName}`,
                    profilePicture: member.personalInfo.profilePicture,
                    value: entry.count,
                });
            }
        }

        return leaderboard;
    }

    /**
     * Get workout leaderboard
     */
    async getWorkoutLeaderboard(
        tenantId: string,
        scope: 'gym' | 'branch' | 'global' = 'gym',
        period: 'week' | 'month' | 'all_time' = 'month',
        branchId?: string,
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const dateFilter = this.getDateFilter(period);

        const query: any = { tenantId };
        if (scope === 'branch' && branchId) {
            query.branchId = branchId;
        }

        if (dateFilter) {
            query.completedAt = dateFilter;
        }

        const workoutCounts = await Workout.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$memberId',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: limit },
        ]);

        const leaderboard: LeaderboardEntry[] = [];

        for (let i = 0; i < workoutCounts.length; i++) {
            const entry = workoutCounts[i];
            const member = await Member.findById(entry._id).select('firstName lastName profilePicture');

            if (member) {
                leaderboard.push({
                    rank: i + 1,
                    memberId: entry._id.toString(),
                    name: `${member.firstName} ${member.lastName}`,
                    profilePicture: member.personalInfo.profilePicture,
                    value: entry.count,
                });
            }
        }

        return leaderboard;
    }

    /**
     * Get points leaderboard
     */
    async getPointsLeaderboard(
        tenantId: string,
        scope: 'gym' | 'branch' | 'global' = 'gym',
        branchId?: string,
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const query: any = { tenantId };
        if (scope === 'branch' && branchId) {
            query.branchId = branchId;
        }

        const members = await Member.find(query)
            .select('firstName lastName profilePicture gamification')
            .sort({ 'gamification.totalPoints': -1 })
            .limit(limit);

        return members.map((member, index) => ({
            rank: index + 1,
            memberId: member._id.toString(),
            name: `${member.firstName} ${member.lastName}`,
            profilePicture: (member as any).personalInfo?.profilePicture || (member as any).profilePicture,
            value: member.gamification?.totalPoints || 0,
        }));
    }

    /**
     * Get streak leaderboard
     */
    async getStreakLeaderboard(
        tenantId: string,
        type: 'attendance' | 'workout' = 'attendance',
        scope: 'gym' | 'branch' | 'global' = 'gym',
        branchId?: string,
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const query: any = { tenantId };
        if (scope === 'branch' && branchId) {
            query.branchId = branchId;
        }

        const sortField = type === 'attendance'
            ? 'gamification.currentStreak'
            : 'gamification.workoutStreak';

        const members = await Member.find(query)
            .select('firstName lastName profilePicture gamification')
            .sort({ [sortField]: -1 })
            .limit(limit);

        return members.map((member, index) => ({
            rank: index + 1,
            memberId: member._id.toString(),
            name: `${member.firstName} ${member.lastName}`,
            profilePicture: (member as any).personalInfo?.profilePicture || (member as any).profilePicture,
            value: type === 'attendance'
                ? member.gamification?.currentStreak || 0
                : member.gamification?.workoutStreak || 0,
        }));
    }

    /**
     * Get member's rank in leaderboard
     */
    async getMemberRank(
        memberId: string,
        type: 'attendance' | 'workout' | 'points' | 'streak',
        period: 'week' | 'month' | 'all_time' = 'month'
    ) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        let leaderboard: LeaderboardEntry[] = [];

        switch (type) {
            case 'attendance':
                leaderboard = await this.getAttendanceLeaderboard(member.tenantId.toString(), 'gym', period, undefined, 100);
                break;
            case 'workout':
                leaderboard = await this.getWorkoutLeaderboard(member.tenantId.toString(), 'gym', period, undefined, 100);
                break;
            case 'points':
                leaderboard = await this.getPointsLeaderboard(member.tenantId.toString(), 'gym', undefined, 100);
                break;
            case 'streak':
                leaderboard = await this.getStreakLeaderboard(member.tenantId.toString(), 'attendance', 'gym', undefined, 100);
                break;
        }

        const memberEntry = leaderboard.find((entry) => entry.memberId === memberId);

        return {
            rank: memberEntry?.rank || null,
            value: memberEntry?.value || 0,
            total: leaderboard.length,
            topPercentile: memberEntry ? ((memberEntry.rank / leaderboard.length) * 100).toFixed(1) : null,
        };
    }

    /**
     * Get all leaderboards for member
     */
    async getAllLeaderboardsForMember(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const [attendance, workout, points, streak] = await Promise.all([
            this.getMemberRank(memberId, 'attendance', 'month'),
            this.getMemberRank(memberId, 'workout', 'month'),
            this.getMemberRank(memberId, 'points'),
            this.getMemberRank(memberId, 'streak'),
        ]);

        return {
            attendance,
            workout,
            points,
            streak,
        };
    }

    /**
     * Get date filter for period
     */
    private getDateFilter(period: 'week' | 'month' | 'all_time') {
        if (period === 'all_time') return null;

        const now = new Date();
        const startDate = new Date();

        if (period === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (period === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        }

        return { $gte: startDate };
    }
}

export default new LeaderboardService();
