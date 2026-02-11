import { Router } from 'express';
import trainerController from '../controllers/trainer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole('gym_owner', 'branch_manager'), trainerController.createTrainer.bind(trainerController));
router.get('/', authenticate, trainerController.getTrainers.bind(trainerController));
router.get('/:trainerId', authenticate, trainerController.getTrainerById.bind(trainerController));
router.put('/:trainerId', requireAnyRole('gym_owner', 'branch_manager', 'trainer'), trainerController.updateTrainer.bind(trainerController));
router.post('/:trainerId/certifications', requireAnyRole('gym_owner', 'branch_manager', 'trainer'), trainerController.addCertification.bind(trainerController));
router.put('/:trainerId/availability', requireAnyRole('trainer', 'branch_manager'), trainerController.updateAvailability.bind(trainerController));
router.post('/:trainerId/ratings', requireAnyRole('member'), trainerController.addRating.bind(trainerController));
router.get('/:trainerId/stats', requireAnyRole('gym_owner', 'branch_manager', 'trainer'), trainerController.getTrainerStats.bind(trainerController));

export default router;
