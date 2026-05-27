import { Router, Request, Response, NextFunction } from 'express';
import memberController from '../controllers/member.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { invalidateTenantCache } from '../middleware/cache.middleware';

// Invalidate tenant cache after any mutation
const invalidateCache = async (req: Request, _res: Response, next: NextFunction) => {
    const tenantId = (req as any).user?.tenantId?.toString();
    if (tenantId) await invalidateTenantCache(tenantId).catch(() => {});
    next();
};

const router = Router();

// Public signup (no auth required)
router.post('/signup', memberController.publicSignup.bind(memberController));

// All other routes require authentication and tenant context
router.use(authenticate);
router.use(tenantContext);

// Member CRUD — specific routes MUST come before /:memberId to avoid param capture
router.get('/me', memberController.getProfile.bind(memberController));
router.post('/', requirePermission('member:create'), invalidateCache, memberController.createMember.bind(memberController));
router.get('/', requirePermission('member:read'), memberController.getMembers.bind(memberController));
router.get('/stats', requirePermission('member:read'), memberController.getMemberStats.bind(memberController));
router.get('/alerts/expiry', requirePermission('member:read'), memberController.getExpiryAlerts.bind(memberController));
router.get('/expiry-alerts', requirePermission('member:read'), memberController.getExpiryAlertsBucketed.bind(memberController));
router.get('/:memberId', requirePermission('member:read'), memberController.getMember.bind(memberController));
router.put('/:memberId', requirePermission('member:update'), invalidateCache, memberController.updateMember.bind(memberController));

// Member status management
router.patch('/:memberId/status', requirePermission('member:update'), memberController.changeStatus.bind(memberController));
router.post('/:memberId/freeze', requirePermission('member:update'), memberController.freezeMember.bind(memberController));
router.post('/:memberId/reactivate', requirePermission('member:update'), memberController.reactivateMember.bind(memberController));
router.post('/:memberId/transfer', requirePermission('member:update'), memberController.transferMember.bind(memberController));

// Member measurements
router.post('/:memberId/measurements', requirePermission('member:update'), memberController.addMeasurement.bind(memberController));

// Profile picture & transformation gallery
router.put('/:memberId/profile-picture', requirePermission('member:update'), memberController.uploadProfilePicture.bind(memberController));
router.post('/:memberId/transformation', requirePermission('member:update'), memberController.addTransformationPhoto.bind(memberController));

// Timeline
router.get('/:memberId/timeline', requirePermission('member:read'), memberController.getMemberTimeline.bind(memberController));

// Change subscription plan
router.patch('/:memberId/plan', requirePermission('member:update'), memberController.changeMemberPlan.bind(memberController));

// Health info
router.patch('/:memberId/health', requirePermission('member:update'), memberController.updateHealthInfo.bind(memberController));

// Documents
router.post('/:memberId/documents', requirePermission('member:update'), memberController.uploadDocument.bind(memberController));
router.delete('/:memberId/documents/:docId', requirePermission('member:update'), memberController.deleteDocument.bind(memberController));

// Workout logs
router.post('/:memberId/workout-logs', requirePermission('member:update'), memberController.addWorkoutLog.bind(memberController));
router.get('/:memberId/workout-logs', requirePermission('member:read'), memberController.getWorkoutLogs.bind(memberController));

// Delete member (soft delete → archived)
router.delete('/:memberId', requirePermission('member:delete'), invalidateCache, memberController.deleteMember.bind(memberController));

export default router;
