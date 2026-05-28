import { Router } from 'express';
import inquiryController from '../controllers/inquiry.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), inquiryController.getInquiries.bind(inquiryController));
router.post('/', optionalAuth, inquiryController.createInquiry.bind(inquiryController));
router.get('/stats', authenticate, requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), inquiryController.getInquiryStats.bind(inquiryController));
router.put('/:id', authenticate, requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), inquiryController.updateInquiry.bind(inquiryController));
router.delete('/:id', authenticate, requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), inquiryController.deleteInquiry.bind(inquiryController));
router.post('/:id/convert', authenticate, requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), inquiryController.convertToMember.bind(inquiryController));

export default router;
