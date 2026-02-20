import { Router } from 'express';
import workoutController from '../controllers/workout.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Workout routes
router.get('/', workoutController.getWorkouts.bind(workoutController));
router.post('/', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), workoutController.createWorkout.bind(workoutController));
router.get('/:id', workoutController.getWorkout.bind(workoutController));

// Exercise routes (also accessible via /workouts/exercises if desired, but frontend asks for /exercises)
// For now, let's keep them here and register them separately or at /workouts/exercises
router.get('/exercises', workoutController.getExercises.bind(workoutController));

export default router;
