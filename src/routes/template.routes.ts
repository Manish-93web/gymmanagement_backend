import { Router } from 'express';
import templateController from '../controllers/template.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'super_admin', 'branch_manager'));

router.post('/', templateController.createTemplate.bind(templateController));
router.get('/', templateController.getTemplates.bind(templateController));
router.get('/:templateId', templateController.getTemplateById.bind(templateController));
router.put('/:templateId', templateController.updateTemplate.bind(templateController));
router.delete('/:templateId', templateController.deleteTemplate.bind(templateController));

export default router;
