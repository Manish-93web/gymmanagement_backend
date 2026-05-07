import { Router, Request, Response } from 'express';
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

// BullMQ queue statistics
router.get('/queues/:queueName/stats', async (req: Request, res: Response) => {
    try {
        const { queueName } = req.params as Record<string, string>;
        const BullMQService = (await import('../services/bullmq-automation.service')).default;
        const stats = await BullMQService.getQueueStats(queueName);
        res.status(200).json({ success: true, data: stats });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
