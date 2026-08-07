import { Router, Request, Response } from 'express';
import gamificationController from '../controllers/gamification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import NutritionLog from '../models/NutritionLog.model';
import WearableData from '../models/WearableData.model';

const router = Router();
router.use(authenticate);

router.get('/dashboard', gamificationController.getDashboard.bind(gamificationController));
router.get('/badges', gamificationController.getBadges.bind(gamificationController));
router.post('/badges', requireAnyRole('gym_owner', 'super_admin'), gamificationController.createBadge.bind(gamificationController));
router.get('/badges/:badgeId', gamificationController.getBadgeDetail.bind(gamificationController));
router.get('/streaks', gamificationController.getStreaks.bind(gamificationController));
router.get('/leaderboard', gamificationController.getLeaderboard.bind(gamificationController));
router.get('/challenges', gamificationController.getChallenges.bind(gamificationController));
router.post('/challenges', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), gamificationController.createChallenge.bind(gamificationController));
router.put('/challenges/:challengeId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), gamificationController.updateChallenge.bind(gamificationController));
router.post('/challenges/:challengeId/join', gamificationController.joinChallenge.bind(gamificationController));
router.post('/challenges/:challengeId/leave', gamificationController.leaveChallenge.bind(gamificationController));
router.get('/rewards', gamificationController.getRewards.bind(gamificationController));
router.post('/rewards', requireAnyRole('gym_owner', 'super_admin'), gamificationController.createReward.bind(gamificationController));
router.post('/rewards/redeem', gamificationController.redeemReward.bind(gamificationController));
router.get('/rewards/redemptions', gamificationController.getRedemptions.bind(gamificationController));

// Monthly challenge progress summary for the current calendar month
router.get('/monthly-summary', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const tenantId = user.tenantId;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysElapsed = now.getDate();
        const stepDailyGoal = 8000;
        const workoutTarget = 6;
        const mealLogStreakTarget = 7;
        const stepQualifyingTarget = 21;

        const member = await Member.findOne({ userId: user._id }).select('_id').lean();
        if (!member) {
            return res.json({
                success: true,
                data: {
                    workoutCount: 0, workoutTarget,
                    mealLogStreak: 0, mealLogStreakTarget,
                    stepQualifyingDays: 0, stepQualifyingTarget,
                    stepDailyGoal, month: monthStart.toISOString(), daysInMonth, daysElapsed,
                },
            });
        }
        const memberId = member._id;

        // Pillar 1: gym check-ins so far this month
        const workoutCount = await Attendance.countDocuments({
            tenantId, memberId, checkInTime: { $gte: monthStart, $lte: monthEnd },
        });

        // Pillar 2: current consecutive-day meal-logging streak (ending today)
        const mealLogs = await NutritionLog.find({
            tenantId, memberId, date: { $gte: monthStart, $lte: monthEnd },
        }).select('date').lean();
        const loggedDates = new Set(mealLogs.map((l: any) => new Date(l.date).toDateString()));
        let mealLogStreak = 0;
        const cursor = new Date(now);
        cursor.setHours(0, 0, 0, 0);
        while (loggedDates.has(cursor.toDateString())) {
            mealLogStreak++;
            cursor.setDate(cursor.getDate() - 1);
        }

        // Pillar 3: days this month where wearable-recorded steps hit the daily goal
        const wearableDocs = await WearableData.find({ tenantId, memberId }).select('entries').lean();
        const qualifyingDaySet = new Set<string>();
        for (const doc of wearableDocs) {
            for (const entry of (doc as any).entries ?? []) {
                const d = new Date(entry.date);
                if (d >= monthStart && d <= monthEnd && (entry.steps ?? 0) >= stepDailyGoal) {
                    qualifyingDaySet.add(d.toDateString());
                }
            }
        }

        return res.json({
            success: true,
            data: {
                workoutCount, workoutTarget,
                mealLogStreak, mealLogStreakTarget,
                stepQualifyingDays: qualifyingDaySet.size, stepQualifyingTarget,
                stepDailyGoal,
                month: monthStart.toISOString(),
                daysInMonth,
                daysElapsed,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Award points to a member (staff/trainer/owner initiated)
router.post('/award-points', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { memberId, points, reason } = req.body;
        if (!memberId || !points || points <= 0) {
            return res.status(400).json({ success: false, message: 'memberId and positive points are required' });
        }
        const member = await Member.findByIdAndUpdate(
            memberId,
            { $inc: { 'gamification.totalPoints': points } },
            { new: true }
        ).select('firstName lastName gamification');
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
        return res.json({
            success: true,
            data: {
                memberId,
                pointsAwarded: points,
                totalPoints: member.gamification?.totalPoints,
                reason,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
