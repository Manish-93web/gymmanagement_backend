import { Router } from 'express';
import memberController from '../controllers/member.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

// Public signup (no auth required)
router.post('/signup', memberController.publicSignup.bind(memberController));

// All other routes require authentication and tenant context
router.use(authenticate);
router.use(tenantContext);

// Member CRUD
router.get('/me', memberController.getProfile.bind(memberController));
router.post('/', requirePermission('member:create'), memberController.createMember.bind(memberController));
router.get('/', requirePermission('member:read'), memberController.getMembers.bind(memberController));
router.get('/stats', requirePermission('member:read'), memberController.getMemberStats.bind(memberController));
router.get('/:memberId', requirePermission('member:read'), memberController.getMember.bind(memberController));
router.put('/:memberId', requirePermission('member:update'), memberController.updateMember.bind(memberController));

// Member status management
router.patch('/:memberId/status', requirePermission('member:update'), memberController.changeStatus.bind(memberController));
router.post('/:memberId/freeze', requirePermission('member:update'), memberController.freezeMember.bind(memberController));
router.post('/:memberId/reactivate', requirePermission('member:update'), memberController.reactivateMember.bind(memberController));
router.post('/:memberId/transfer', requirePermission('member:update'), memberController.transferMember.bind(memberController));

// Member measurements
router.post('/:memberId/measurements', requirePermission('member:update'), memberController.addMeasurement.bind(memberController));

export default router;
