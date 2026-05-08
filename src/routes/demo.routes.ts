import { Router } from 'express';
import demoController from '../controllers/demo.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'super_admin'));

router.get('/status', demoController.getStatus.bind(demoController));
router.post('/seed', demoController.seedDemo.bind(demoController));
router.post('/refresh', demoController.refreshDemo.bind(demoController));

export default router;
