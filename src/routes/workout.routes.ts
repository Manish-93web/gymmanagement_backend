import { Router } from 'express';
import workoutController from '../controllers/workout.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Workout routes
router.get('/', workoutController.getWorkouts.bind(workoutController));
router.post('/', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), workoutController.createWorkout.bind(workoutController));
router.get('/stats', workoutController.getWorkoutStats.bind(workoutController));
router.get('/personal-records', workoutController.getPersonalRecords.bind(workoutController));
router.get('/plans', workoutController.getWorkoutPlans.bind(workoutController));
router.post('/plans', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), workoutController.createWorkoutPlan.bind(workoutController));
router.post('/log', workoutController.logWorkout.bind(workoutController));
router.get('/:id', workoutController.getWorkout.bind(workoutController));
router.put('/:id', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), workoutController.updateWorkout.bind(workoutController));
router.delete('/:id', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), workoutController.deleteWorkout.bind(workoutController));
router.post('/:id/progression', workoutController.applyProgression.bind(workoutController));

export default router;
