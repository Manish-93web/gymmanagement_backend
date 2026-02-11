import { Router } from 'express';
import automationController from '../controllers/automation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'super_admin'));

router.post('/', automationController.createRule.bind(automationController));
router.get('/', automationController.getRules.bind(automationController));
router.get('/:ruleId', automationController.getRuleById.bind(automationController));
router.put('/:ruleId', automationController.updateRule.bind(automationController));
router.delete('/:ruleId', automationController.deleteRule.bind(automationController));
router.get('/:ruleId/logs', automationController.getExecutionLogs.bind(automationController));

export default router;
