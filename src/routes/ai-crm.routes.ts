import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import aiCrmController from '../controllers/ai-crm.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import CRMIntegration from '../models/CRMIntegration.model';
import Lead from '../models/Lead.model';

const router = Router();

// Public lead submission (no auth — kiosk/website)
router.post('/crm/leads/public', aiCrmController.createPublicLead.bind(aiCrmController));

router.use(authenticate);

// AI routes
router.post('/ai/workout-plan', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), aiCrmController.generateWorkoutPlan.bind(aiCrmController));
router.post('/ai/diet-plan', requireAnyRole('trainer', 'gym_owner', 'branch_manager', 'super_admin'), aiCrmController.generateDietPlan.bind(aiCrmController));
router.post('/ai/chatbot', requireAnyRole('member', 'trainer', 'super_admin'), aiCrmController.chatbot.bind(aiCrmController));
router.get('/ai/predict', aiCrmController.predict.bind(aiCrmController));
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

// Analytics: lead source breakdown
router.get('/crm/analytics/lead-sources', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;

        const results = await Lead.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const total = results.reduce((sum: number, r: any) => sum + r.count, 0);

        const data = results.map((r: any) => ({
            source: r._id ?? 'unknown',
            count: r.count,
            percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
        }));

        res.json({ success: true, data, total });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// A-01: CRM Performance leaderboard
router.get('/crm/performance', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getPerformance.bind(aiCrmController));

// A-02: CRM Forecast
router.get('/crm/forecast', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getForecast.bind(aiCrmController));

// CRM Settings
router.get('/crm/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.getCRMSettings.bind(aiCrmController));
router.post('/crm/settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), aiCrmController.saveCRMSettings.bind(aiCrmController));

// ─── CRM Integrations (Facebook / Instagram) ──────────────────────────────────

router.get('/crm/integrations', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const integration = await CRMIntegration.findOne({ tenantId, platform: 'facebook' }).lean();
        const webhookUrl = `${process.env.BACKEND_URL || ''}/api/crm-webhook/facebook`;
        res.json({
            success: true,
            data: {
                facebookVerifyToken: (integration as any)?.verifyToken || process.env.FACEBOOK_VERIFY_TOKEN || '',
                facebookPageAccessToken: (integration as any)?.accessToken || '',
                webhookUrl,
                connected: (integration as any)?.connected || false,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/crm/integrations', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const { facebookVerifyToken, facebookPageAccessToken } = req.body;
        const integration = await CRMIntegration.findOneAndUpdate(
            { tenantId, platform: 'facebook' },
            {
                $set: {
                    verifyToken: facebookVerifyToken,
                    accessToken: facebookPageAccessToken,
                    connected: !!(facebookVerifyToken && facebookPageAccessToken),
                },
            },
            { new: true, upsert: true }
        ).lean();
        const webhookUrl = `${process.env.BACKEND_URL || ''}/api/crm-webhook/facebook`;
        res.json({
            success: true,
            data: {
                facebookVerifyToken: (integration as any)?.verifyToken || '',
                facebookPageAccessToken: (integration as any)?.accessToken || '',
                webhookUrl,
                connected: (integration as any)?.connected || false,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
