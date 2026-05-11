import { Router, Request, Response } from 'express';
import gamificationController from '../controllers/gamification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);

router.get('/dashboard', gamificationController.getDashboard.bind(gamificationController));
router.get('/badges', gamificationController.getBadges.bind(gamificationController));
router.post('/badges', requireAnyRole('gym_owner', 'super_admin'), gamificationController.createBadge.bind(gamificationController));
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
