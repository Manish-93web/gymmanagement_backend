import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Workout from '../models/Workout.model';
import StreakHistory from '../models/StreakHistory.model';
import logger from '../config/logger';

class StreakService {
    /**
     * Update member streak after check-in
     */
    async updateStreakAfterCheckIn(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Check if already checked in today
        const todayCheckIn = await Attendance.findOne({
            memberId,
            checkInTime: { $gte: today },
        });

        if (!todayCheckIn) {
            // First check-in of the day doesn't count yet
            return member.gamification;
        }

        // Check if checked in yesterday
        const yesterdayCheckIn = await Attendance.findOne({
            memberId,
            checkInTime: {
                $gte: yesterday,
                $lt: today,
            },
        });

        const currentStreak = member.gamification?.currentStreak || 0;
        const longestStreak = member.gamification?.longestStreak || 0;

        let newStreak = currentStreak;

        if (yesterdayCheckIn) {
            // Continue streak
            newStreak = currentStreak + 1;
        } else {
            // Streak broken, start new
            if (currentStreak > 0) {
                // Save streak history
                await StreakHistory.create({
                    memberId,
                    streakDays: currentStreak,
                    startDate: new Date(Date.now() - currentStreak * 24 * 60 * 60 * 1000),
                    endDate: yesterday,
                });
            }
            newStreak = 1;
        }

        // Update member
        await Member.findByIdAndUpdate(memberId, {
            'gamification.currentStreak': newStreak,
            'gamification.longestStreak': Math.max(newStreak, longestStreak),
            'gamification.lastStreakUpdate': new Date(),
        });

        logger.info('Streak updated', { memberId, newStreak });

        return {
            currentStreak: newStreak,
            longestStreak: Math.max(newStreak, longestStreak),
            isNewRecord: newStreak > longestStreak,
        };
    }

    /**
     * Update workout streak
     */
    async updateWorkoutStreak(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Check if worked out yesterday
        const yesterdayWorkout = await Workout.findOne({
            memberId,
            completedAt: {
                $gte: yesterday,
                $lt: today,
            },
        });

        const currentWorkoutStreak = member.gamification?.workoutStreak || 0;
        const longestWorkoutStreak = member.gamification?.longestWorkoutStreak || 0;

        let newStreak = currentWorkoutStreak;

        if (yesterdayWorkout) {
            newStreak = currentWorkoutStreak + 1;
        } else {
            newStreak = 1;
        }

        await Member.findByIdAndUpdate(memberId, {
            'gamification.workoutStreak': newStreak,
            'gamification.longestWorkoutStreak': Math.max(newStreak, longestWorkoutStreak),
        });

        return {
            workoutStreak: newStreak,
            longestWorkoutStreak: Math.max(newStreak, longestWorkoutStreak),
        };
    }

    /**
     * Get streak statistics
     */
    async getStreakStats(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const streakHistory = await StreakHistory.find({ memberId })
            .sort({ endDate: -1 })
            .limit(10);

        return {
            current: {
                attendance: member.gamification?.currentStreak || 0,
                workout: member.gamification?.workoutStreak || 0,
            },
            longest: {
                attendance: member.gamification?.longestStreak || 0,
                workout: member.gamification?.longestWorkoutStreak || 0,
            },
            history: streakHistory,
        };
    }

    /**
     * Get leaderboard by streak
     */
    async getStreakLeaderboard(tenantId: string, type: 'attendance' | 'workout' = 'attendance', limit: number = 10) {
        const sortField = type === 'attendance' ? 'gamification.currentStreak' : 'gamification.workoutStreak';

        const members = await Member.find({ tenantId })
            .select('firstName lastName email gamification profilePicture')
            .sort({ [sortField]: -1 })
            .limit(limit);

        return members.map((member, index) => ({
            rank: index + 1,
            memberId: member._id,
            name: `${member.firstName} ${member.lastName}`,
            profilePicture: member.profilePicture,
            streak: type === 'attendance'
                ? member.gamification?.currentStreak || 0
                : member.gamification?.workoutStreak || 0,
        }));
    }

    /**
     * Check and reset broken streaks (run daily)
     */
    async checkAndResetBrokenStreaks(tenantId: string) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find members with active streaks
        const membersWithStreaks = await Member.find({
            tenantId,
            'gamification.currentStreak': { $gt: 0 },
        });

        let resetCount = 0;

        for (const member of membersWithStreaks) {
            // Check if they checked in yesterday
            const yesterdayCheckIn = await Attendance.findOne({
                memberId: member._id,
                checkInTime: {
                    $gte: yesterday,
                    $lt: today,
                },
            });

            if (!yesterdayCheckIn) {
                // Streak broken
                const currentStreak = member.gamification?.currentStreak || 0;

                if (currentStreak > 0) {
                    // Save to history
                    await StreakHistory.create({
                        memberId: member._id,
                        streakDays: currentStreak,
                        startDate: new Date(Date.now() - currentStreak * 24 * 60 * 60 * 1000),
                        endDate: yesterday,
                    });

                    // Reset streak
                    await Member.findByIdAndUpdate(member._id, {
                        'gamification.currentStreak': 0,
                    });

                    resetCount++;
                }
            }
        }

        logger.info('Broken streaks reset', { tenantId, resetCount });

        return {
            success: true,
            resetCount,
        };
    }
}

export default new StreakService();
