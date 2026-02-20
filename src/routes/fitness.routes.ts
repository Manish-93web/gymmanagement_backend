import { Router } from 'express';
import fitnessController from '../controllers/fitness.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Workout routes
router.post('/workouts/log', requireAnyRole('member', 'trainer', 'super_admin'), fitnessController.logWorkout.bind(fitnessController));
router.get('/workouts/member/:memberId', authenticate, fitnessController.getMemberWorkouts.bind(fitnessController));
router.get('/workouts/member/:memberId/prs', authenticate, fitnessController.getPersonalRecords.bind(fitnessController));
router.get('/workouts/member/:memberId/stats', authenticate, fitnessController.getWorkoutStats.bind(fitnessController));

// Diet routes
router.post('/diet/calculate-macros', requireAnyRole('trainer', 'member', 'super_admin'), fitnessController.calculateMacros.bind(fitnessController));
router.post('/diet/plans', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), fitnessController.createDietPlan.bind(fitnessController));
router.get('/diet/plans/member/:memberId', authenticate, fitnessController.getMemberDietPlans.bind(fitnessController));
router.post('/diet/plans/:dietPlanId/compliance', requireAnyRole('member', 'trainer', 'super_admin'), fitnessController.logCompliance.bind(fitnessController));
router.get('/diet/member/:memberId/stats', authenticate, fitnessController.getDietStats.bind(fitnessController));

export default router;
