import { Router } from 'express';
import marketingController from '../controllers/marketing.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getCampaigns.bind(marketingController));
router.post('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.createCampaign.bind(marketingController));
router.get('/campaigns/stats', requireAnyRole('gym_owner', 'super_admin'), marketingController.getCampaignStats.bind(marketingController));
router.get('/campaigns/:campaignId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), marketingController.getCampaignById.bind(marketingController));
router.put('/campaigns/:campaignId', requireAnyRole('gym_owner', 'super_admin'), marketingController.updateCampaign.bind(marketingController));
router.delete('/campaigns/:campaignId', requireAnyRole('gym_owner', 'super_admin'), marketingController.deleteCampaign.bind(marketingController));

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

export default router;
