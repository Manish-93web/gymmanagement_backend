import { Router, Request, Response } from 'express';
import marketingController from '../controllers/marketing.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import EmailCampaignService from '../services/email-campaign.service';
import PromoCampaignService from '../services/promo-campaign.service';
import EmailCampaign from '../models/EmailCampaign.model';
import PromoCampaign from '../models/PromoCampaign.model';

const router = Router();
router.use(authenticate);

router.get('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getCampaigns.bind(marketingController));
router.post('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.createCampaign.bind(marketingController));
router.get('/campaigns/stats', requireAnyRole('gym_owner', 'super_admin'), marketingController.getCampaignStats.bind(marketingController));
router.get('/campaigns/:campaignId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getCampaignById.bind(marketingController));
router.put('/campaigns/:campaignId', requireAnyRole('gym_owner', 'super_admin'), marketingController.updateCampaign.bind(marketingController));
router.delete('/campaigns/:campaignId', requireAnyRole('gym_owner', 'super_admin'), marketingController.deleteCampaign.bind(marketingController));
router.post('/campaigns/:campaignId/send', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.sendCampaign.bind(marketingController));

router.get('/coupons', marketingController.getCoupons.bind(marketingController));
router.post('/coupons', requireAnyRole('gym_owner', 'super_admin'), marketingController.createCoupon.bind(marketingController));
router.post('/coupons/validate', marketingController.validateCoupon.bind(marketingController));
router.get('/coupons/:couponId', marketingController.getCouponById.bind(marketingController));
router.put('/coupons/:couponId', requireAnyRole('gym_owner', 'super_admin'), marketingController.updateCoupon.bind(marketingController));
router.delete('/coupons/:couponId', requireAnyRole('gym_owner', 'super_admin'), marketingController.deleteCoupon.bind(marketingController));

router.get('/referrals', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getReferrals.bind(marketingController));
router.post('/referrals', requireAnyRole('gym_owner', 'super_admin'), marketingController.createReferral.bind(marketingController));
router.get('/referrals/stats', requireAnyRole('gym_owner', 'super_admin'), marketingController.getReferralStats.bind(marketingController));
router.post('/referrals/convert', marketingController.processReferralConversion.bind(marketingController));

// A-03: Email sequences
router.get('/sequences', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getSequences.bind(marketingController));
router.post('/sequences', requireAnyRole('gym_owner', 'super_admin'), marketingController.createSequence.bind(marketingController));

// A-04: Social/push campaigns
router.get('/social', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getSocialCampaigns.bind(marketingController));
router.post('/social', requireAnyRole('gym_owner', 'super_admin'), marketingController.createSocialCampaign.bind(marketingController));

// A-05: SMS campaigns
router.get('/sms-campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getSmsCampaigns.bind(marketingController));
router.post('/sms-campaigns', requireAnyRole('gym_owner', 'super_admin'), marketingController.createSmsCampaign.bind(marketingController));

// A-06: Email campaigns (EmailCampaignService)
router.get('/email-campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const campaigns = await EmailCampaign.find({ tenantId }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, data: { campaigns } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/email-campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const campaign = await EmailCampaignService.createCampaign({ ...req.body, tenantId });
        res.status(201).json({ success: true, data: campaign });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/email-campaigns/:id/send', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const result = await EmailCampaignService.sendCampaign(String(req.params.id));
        res.json({ success: true, data: result });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.get('/email-campaigns/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const campaign = await EmailCampaign.findById(String(req.params.id));
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, data: campaign });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/email-campaigns/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await EmailCampaign.findByIdAndDelete(String(req.params.id));
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// A-07: Promo campaigns (PromoCampaignService)
router.get('/promo-campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const campaigns = await PromoCampaign.find({ tenantId }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, data: { campaigns } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/promo-campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const campaign = await PromoCampaignService.createCampaign({ ...req.body, tenantId });
        res.status(201).json({ success: true, data: campaign });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/promo-campaigns/:id/launch', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const result = await PromoCampaignService.launchCampaign(String(req.params.id));
        res.json({ success: true, data: result });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.get('/promo-campaigns/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const campaign = await PromoCampaign.findById(String(req.params.id));
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, data: campaign });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/promo-campaigns/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await PromoCampaign.findByIdAndDelete(String(req.params.id));
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
