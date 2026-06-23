import { Router } from 'express';
import * as retentionController from '../controllers/retention.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Retention routes
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getInactivityStats);
router.get('/inactive-members', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getInactiveMembers);

// Campaigns
router.get('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getCampaigns);
router.post('/campaigns', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.createCampaign);
router.get('/campaigns/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getCampaignById);

// Offers
router.get('/offers', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getOffers);
router.get('/member/offers', requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin'), retentionController.getMemberOffers);
router.post('/offers/redeem', requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin'), retentionController.redeemOffer);

// Send offer to a specific member
router.post('/send-offer/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.sendOffer);

// Actions
router.post('/actions', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.logAction);
router.get('/members/:memberId/actions', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), retentionController.getMemberActions);

export default router;
