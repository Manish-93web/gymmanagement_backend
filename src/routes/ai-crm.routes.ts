import { Router } from 'express';
import aiCrmController from '../controllers/ai-crm.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// AI routes
router.post('/ai/workout-plan', requireAnyRole(['trainer', 'gym_owner', 'branch_manager']), aiCrmController.generateWorkoutPlan.bind(aiCrmController));
router.post('/ai/diet-plan', requireAnyRole(['trainer', 'gym_owner', 'branch_manager']), aiCrmController.generateDietPlan.bind(aiCrmController));
router.post('/ai/chatbot', requireAnyRole(['member', 'trainer']), aiCrmController.chatbot.bind(aiCrmController));
router.get('/ai/churn/:memberId', requireAnyRole(['gym_owner', 'branch_manager']), aiCrmController.predictChurn.bind(aiCrmController));
router.get('/ai/insights/:memberId', requireAnyRole(['trainer', 'member']), aiCrmController.getProgressInsights.bind(aiCrmController));

// CRM routes
router.post('/crm/leads', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), aiCrmController.createLead.bind(aiCrmController));
router.get('/crm/leads', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), aiCrmController.getLeads.bind(aiCrmController));
router.patch('/crm/leads/:leadId/status', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), aiCrmController.updateLeadStatus.bind(aiCrmController));
router.post('/crm/leads/:leadId/follow-up', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), aiCrmController.addFollowUp.bind(aiCrmController));
router.get('/crm/stats', requireAnyRole(['gym_owner', 'branch_manager']), aiCrmController.getLeadStats.bind(aiCrmController));
router.get('/crm/funnel', requireAnyRole(['gym_owner', 'branch_manager']), aiCrmController.getSalesFunnel.bind(aiCrmController));

export default router;
