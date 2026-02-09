import Member from '../models/Member.model';
import GamificationBadgeService from './gamification-badge.service';
import StreakService from './streak.service';
import LeaderboardService from './leaderboard.service';
import ChallengeService from './challenge.service';
import RewardPointsService from './reward-points.service';
import logger from '../config/logger';

class GamificationDashboardService {
    /**
     * Get complete gamification dashboard for member
     */
    async getMemberDashboard(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        // Get all gamification data in parallel
        const [
            badges,
            streakStats,
            leaderboardRanks,
            activeChallenges,
            pointsSummary,
            recentRedemptions,
        ] = await Promise.all([
            GamificationBadgeService.getMemberBadges(memberId),
            StreakService.getStreakStats(memberId),
            LeaderboardService.getAllLeaderboardsForMember(memberId),
            ChallengeService.getMemberChallenges(memberId),
            RewardPointsService.getPointsSummary(memberId),
            RewardPointsService.getMemberRedemptions(memberId),
        ]);

        // Calculate progress to next badge
        const allBadges = await GamificationBadgeService.getAllBadgesWithStatus(
            memberId,
            member.tenantId
        );
        const nextBadges = allBadges.filter((b) => !b.earned).slice(0, 3);

        return {
            overview: {
                totalPoints: member.gamification?.totalPoints || 0,
                currentStreak: member.gamification?.currentStreak || 0,
                longestStreak: member.gamification?.longestStreak || 0,
                badgesEarned: badges.length,
                challengesCompleted: activeChallenges.filter((c: any) => c.completed).length,
            },
            badges: {
                earned: badges.slice(0, 6), // Latest 6
                nextToEarn: nextBadges,
                total: allBadges.length,
                earnedCount: badges.length,
            },
            streaks: streakStats,
            leaderboards: leaderboardRanks,
            challenges: {
                active: activeChallenges.filter((c: any) => c.challengeId.status === 'active').slice(0, 3),
                completed: activeChallenges.filter((c: any) => c.challengeId.status === 'completed').length,
            },
            rewards: {
                summary: pointsSummary,
                recentRedemptions: recentRedemptions.slice(0, 5),
            },
        };
    }

    /**
     * Get gym-wide gamification statistics
     */
    async getGymStatistics(tenantId: string) {
        const [
            totalMembers,
            badgeStats,
            topStreaks,
            activeChallenges,
            rewardStats,
        ] = await Promise.all([
            Member.countDocuments({ tenantId }),
            GamificationBadgeService.getBadgeStatistics(tenantId),
            StreakService.getStreakLeaderboard(tenantId, 'attendance', 5),
            ChallengeService.getActiveChallenges(tenantId),
            RewardPointsService.getRewardStatistics(tenantId),
        ]);

        // Get engagement metrics
        const membersWithPoints = await Member.countDocuments({
            tenantId,
            'gamification.totalPoints': { $gt: 0 },
        });

        const membersWithStreaks = await Member.countDocuments({
            tenantId,
            'gamification.currentStreak': { $gt: 0 },
        });

        return {
            overview: {
                totalMembers,
                engagedMembers: membersWithPoints,
                engagementRate: ((membersWithPoints / totalMembers) * 100).toFixed(1),
                activeStreaks: membersWithStreaks,
            },
            badges: badgeStats,
            topStreaks,
            challenges: {
                active: activeChallenges.length,
                total: await ChallengeService.getActiveChallenges(tenantId).then((c) => c.length),
            },
            rewards: rewardStats,
        };
    }

    /**
     * Get leaderboard dashboard
     */
    async getLeaderboardDashboard(tenantId: string, branchId?: string) {
        const [
            attendanceLeaderboard,
            workoutLeaderboard,
            pointsLeaderboard,
            streakLeaderboard,
        ] = await Promise.all([
            LeaderboardService.getAttendanceLeaderboard(tenantId, branchId ? 'branch' : 'gym', 'month', branchId, 10),
            LeaderboardService.getWorkoutLeaderboard(tenantId, branchId ? 'branch' : 'gym', 'month', branchId, 10),
            LeaderboardService.getPointsLeaderboard(tenantId, branchId ? 'branch' : 'gym', branchId, 10),
            LeaderboardService.getStreakLeaderboard(tenantId, 'attendance', branchId ? 'branch' : 'gym', branchId, 10),
        ]);

        return {
            attendance: attendanceLeaderboard,
            workout: workoutLeaderboard,
            points: pointsLeaderboard,
            streak: streakLeaderboard,
        };
    }

    /**
     * Get achievement feed (recent badges earned)
     */
    async getAchievementFeed(tenantId: string, limit: number = 20) {
        const recentBadges = await GamificationBadgeService.getBadgeStatistics(tenantId);

        // This would be enhanced with actual recent badge awards
        return {
            recentAchievements: [],
            message: 'Achievement feed coming soon',
        };
    }

    /**
     * Get member progress summary
     */
    async getMemberProgress(memberId: string, period: 'week' | 'month' | 'all_time' = 'month') {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const startDate = this.getStartDate(period);

        // This would include attendance, workouts, points earned in period
        return {
            period,
            startDate,
            endDate: new Date(),
            summary: {
                attendances: 0, // Would calculate from Attendance model
                workouts: 0, // Would calculate from Workout model
                pointsEarned: 0, // Would calculate from point history
                badgesEarned: 0, // Would calculate from MemberBadge model
            },
        };
    }

    /**
     * Get start date for period
     */
    private getStartDate(period: 'week' | 'month' | 'all_time'): Date {
        const now = new Date();
        const startDate = new Date();

        if (period === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (period === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        } else {
            startDate.setFullYear(2000); // All time
        }

        return startDate;
    }
}

export default new GamificationDashboardService();
