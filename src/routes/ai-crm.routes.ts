import { Router } from 'express';
import aiCrmController from '../controllers/ai-crm.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// Public lead submission (no auth — kiosk/website)
router.post('/crm/leads/public', aiCrmController.createPublicLead.bind(aiCrmController));

router.use(authenticate);

// AI routes
router.post('/ai/workout-plan', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), aiCrmController.generateWorkoutPlan.bind(aiCrmController));
router.post('/ai/diet-plan', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), aiCrmController.generateDietPlan.bind(aiCrmController));
router.post('/ai/chatbot', requireAnyRole('member', 'trainer', 'super_admin'), aiCrmController.chatbot.bind(aiCrmController));
router.get('/ai/churn/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.predictChurn.bind(aiCrmController));
router.get('/ai/insights/:memberId', requireAnyRole('trainer', 'member', 'super_admin'), aiCrmController.getProgressInsights.bind(aiCrmController));

// CRM routes
router.post('/crm/leads', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.createLead.bind(aiCrmController));
router.get('/crm/leads', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.getLeads.bind(aiCrmController));
router.get('/crm/leads/:leadId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.getLeadById.bind(aiCrmController));
router.patch('/crm/leads/:leadId/status', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.updateLeadStatus.bind(aiCrmController));
router.post('/crm/leads/:leadId/follow-up', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.addFollowUp.bind(aiCrmController));
router.get('/crm/stats', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getLeadStats.bind(aiCrmController));
router.get('/crm/funnel', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getSalesFunnel.bind(aiCrmController));
router.post('/crm/leads/:leadId/convert', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.convertLead.bind(aiCrmController));
router.patch('/crm/leads/:leadId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.updateLead.bind(aiCrmController));
router.delete('/crm/leads/:leadId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.deleteLead.bind(aiCrmController));
router.post('/crm/leads/:leadId/call-logs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.addCallLog.bind(aiCrmController));
router.get('/crm/leads/:leadId/call-logs', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), aiCrmController.getCallLogs.bind(aiCrmController));

// A-01: CRM Performance leaderboard
router.get('/crm/performance', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getPerformance.bind(aiCrmController));

// A-02: CRM Forecast
router.get('/crm/forecast', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getForecast.bind(aiCrmController));

// CRM Settings
router.get('/crm/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getCRMSettings.bind(aiCrmController));
router.post('/crm/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.saveCRMSettings.bind(aiCrmController));

export default router;
