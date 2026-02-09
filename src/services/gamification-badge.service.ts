import Badge from '../models/Badge.model';
import MemberBadge from '../models/MemberBadge.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Workout from '../models/Workout.model';
import logger from '../config/logger';

interface BadgeConfig {
    name: string;
    description: string;
    icon: string;
    category: 'attendance' | 'workout' | 'achievement' | 'social' | 'milestone';
    criteria: {
        type: 'attendance_count' | 'workout_count' | 'streak_days' | 'weight_lifted' | 'referrals' | 'transformation';
        value: number;
        period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
    };
    points: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
    tenantId: string;
}

class GamificationBadgeService {
    /**
     * Create badge
     */
    async createBadge(config: BadgeConfig) {
        const badge = await Badge.create({
            ...config,
            createdAt: new Date(),
        });

        logger.info('Badge created', { badgeId: badge._id });

        return badge;
    }

    /**
     * Initialize default badges for tenant
     */
    async initializeDefaultBadges(tenantId: string) {
        const defaultBadges: Omit<BadgeConfig, 'tenantId'>[] = [
            // Attendance Badges
            {
                name: 'First Step',
                description: 'Complete your first check-in',
                icon: '🎯',
                category: 'attendance',
                criteria: { type: 'attendance_count', value: 1 },
                points: 10,
                tier: 'bronze',
            },
            {
                name: 'Consistent Warrior',
                description: 'Check in 30 times',
                icon: '💪',
                category: 'attendance',
                criteria: { type: 'attendance_count', value: 30 },
                points: 50,
                tier: 'silver',
            },
            {
                name: 'Gym Regular',
                description: 'Check in 100 times',
                icon: '🏆',
                category: 'attendance',
                criteria: { type: 'attendance_count', value: 100 },
                points: 100,
                tier: 'gold',
            },
            {
                name: 'Gym Legend',
                description: 'Check in 365 times',
                icon: '👑',
                category: 'attendance',
                criteria: { type: 'attendance_count', value: 365 },
                points: 500,
                tier: 'diamond',
            },

            // Streak Badges
            {
                name: 'Week Warrior',
                description: 'Maintain a 7-day streak',
                icon: '🔥',
                category: 'achievement',
                criteria: { type: 'streak_days', value: 7 },
                points: 30,
                tier: 'bronze',
            },
            {
                name: 'Month Master',
                description: 'Maintain a 30-day streak',
                icon: '⚡',
                category: 'achievement',
                criteria: { type: 'streak_days', value: 30 },
                points: 150,
                tier: 'gold',
            },
            {
                name: 'Unstoppable',
                description: 'Maintain a 100-day streak',
                icon: '💎',
                category: 'achievement',
                criteria: { type: 'streak_days', value: 100 },
                points: 1000,
                tier: 'diamond',
            },

            // Workout Badges
            {
                name: 'Workout Beginner',
                description: 'Complete 10 workouts',
                icon: '🏋️',
                category: 'workout',
                criteria: { type: 'workout_count', value: 10 },
                points: 25,
                tier: 'bronze',
            },
            {
                name: 'Fitness Enthusiast',
                description: 'Complete 50 workouts',
                icon: '💪',
                category: 'workout',
                criteria: { type: 'workout_count', value: 50 },
                points: 100,
                tier: 'silver',
            },
            {
                name: 'Workout Champion',
                description: 'Complete 200 workouts',
                icon: '🏆',
                category: 'workout',
                criteria: { type: 'workout_count', value: 200 },
                points: 500,
                tier: 'platinum',
            },

            // Social Badges
            {
                name: 'Team Player',
                description: 'Refer 3 friends',
                icon: '🤝',
                category: 'social',
                criteria: { type: 'referrals', value: 3 },
                points: 100,
                tier: 'silver',
            },
            {
                name: 'Influencer',
                description: 'Refer 10 friends',
                icon: '⭐',
                category: 'social',
                criteria: { type: 'referrals', value: 10 },
                points: 500,
                tier: 'gold',
            },
        ];

        const badges = await Badge.insertMany(
            defaultBadges.map((badge) => ({ ...badge, tenantId, createdAt: new Date() }))
        );

        logger.info('Default badges initialized', { tenantId, count: badges.length });

        return badges;
    }

    /**
     * Check and award badges to member
     */
    async checkAndAwardBadges(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const badges = await Badge.find({ tenantId: member.tenantId });
        const earnedBadges = await MemberBadge.find({ memberId }).select('badgeId');
        const earnedBadgeIds = earnedBadges.map((mb) => mb.badgeId.toString());

        const newBadges: any[] = [];

        for (const badge of badges) {
            // Skip if already earned
            if (earnedBadgeIds.includes(badge._id.toString())) continue;

            // Check criteria
            const earned = await this.checkBadgeCriteria(memberId, badge);

            if (earned) {
                const memberBadge = await MemberBadge.create({
                    memberId,
                    badgeId: badge._id,
                    earnedAt: new Date(),
                    points: badge.points,
                });

                // Add points to member
                await Member.findByIdAndUpdate(memberId, {
                    $inc: { 'gamification.totalPoints': badge.points },
                });

                newBadges.push({
                    badge,
                    earnedAt: memberBadge.earnedAt,
                    points: badge.points,
                });

                logger.info('Badge awarded', { memberId, badgeId: badge._id, badgeName: badge.name });
            }
        }

        return newBadges;
    }

    /**
     * Check if member meets badge criteria
     */
    private async checkBadgeCriteria(memberId: string, badge: any): Promise<boolean> {
        const { type, value } = badge.criteria;

        switch (type) {
            case 'attendance_count': {
                const count = await Attendance.countDocuments({ memberId });
                return count >= value;
            }

            case 'workout_count': {
                const count = await Workout.countDocuments({ memberId });
                return count >= value;
            }

            case 'streak_days': {
                const member = await Member.findById(memberId);
                return (member?.gamification?.currentStreak || 0) >= value;
            }

            case 'referrals': {
                const count = await Member.countDocuments({ referredBy: memberId });
                return count >= value;
            }

            default:
                return false;
        }
    }

    /**
     * Get member badges
     */
    async getMemberBadges(memberId: string) {
        const badges = await MemberBadge.find({ memberId })
            .populate('badgeId')
            .sort({ earnedAt: -1 });

        return badges;
    }

    /**
     * Get all badges with earned status
     */
    async getAllBadgesWithStatus(memberId: string, tenantId: string) {
        const allBadges = await Badge.find({ tenantId }).sort({ points: 1 });
        const earnedBadges = await MemberBadge.find({ memberId }).select('badgeId earnedAt');

        const earnedMap = new Map(
            earnedBadges.map((mb) => [mb.badgeId.toString(), mb.earnedAt])
        );

        return allBadges.map((badge) => ({
            ...badge.toObject(),
            earned: earnedMap.has(badge._id.toString()),
            earnedAt: earnedMap.get(badge._id.toString()) || null,
        }));
    }

    /**
     * Get badge statistics
     */
    async getBadgeStatistics(tenantId: string) {
        const totalBadges = await Badge.countDocuments({ tenantId });
        const totalAwarded = await MemberBadge.countDocuments();

        const badgesByTier = await Badge.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$tier', count: { $sum: 1 } } },
        ]);

        const mostEarnedBadges = await MemberBadge.aggregate([
            {
                $group: {
                    _id: '$badgeId',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'badges',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'badge',
                },
            },
        ]);

        return {
            totalBadges,
            totalAwarded,
            badgesByTier,
            mostEarnedBadges,
        };
    }

    /**
     * Delete badge
     */
    async deleteBadge(badgeId: string) {
        await Badge.findByIdAndDelete(badgeId);
        await MemberBadge.deleteMany({ badgeId });

        logger.info('Badge deleted', { badgeId });

        return {
            success: true,
            message: 'Badge deleted successfully',
        };
    }
}

export default new GamificationBadgeService();
