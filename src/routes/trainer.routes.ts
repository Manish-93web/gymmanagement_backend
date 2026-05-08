import { Router } from 'express';
import trainerController from '../controllers/trainer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), trainerController.createTrainer.bind(trainerController));
router.get('/', authenticate, trainerController.getTrainers.bind(trainerController));
router.get('/:trainerId', authenticate, trainerController.getTrainerById.bind(trainerController));
router.put('/:trainerId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.updateTrainer.bind(trainerController));
router.post('/:trainerId/certifications', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.addCertification.bind(trainerController));
router.put('/:trainerId/availability', requireAnyRole('trainer', 'branch_manager', 'super_admin'), trainerController.updateAvailability.bind(trainerController));
router.post('/:trainerId/ratings', requireAnyRole('member', 'super_admin'), trainerController.addRating.bind(trainerController));
router.get('/:trainerId/stats', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.getTrainerStats.bind(trainerController));
router.delete('/:trainerId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), trainerController.deleteTrainer.bind(trainerController));

export default router;
