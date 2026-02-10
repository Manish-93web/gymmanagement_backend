import { Router } from 'express';
import gamificationController from '../controllers/gamification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All gamification routes are protected
router.use(authenticate);

router.get('/dashboard', gamificationController.getDashboard);
router.get('/badges', gamificationController.getBadges);
router.get('/streaks', gamificationController.getStreaks);

export default router;
