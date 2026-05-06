import { Router } from 'express';
import gamificationController from '../controllers/gamification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

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

export default router;
