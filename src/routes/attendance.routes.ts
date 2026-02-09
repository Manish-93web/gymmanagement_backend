import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), attendanceController.checkIn.bind(attendanceController));
router.post('/:attendanceId/checkout', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), attendanceController.checkOut.bind(attendanceController));
router.get('/member/:memberId', authenticate, attendanceController.getMemberAttendance.bind(attendanceController));
router.get('/current', requireAnyRole(['gym_owner', 'branch_manager', 'staff']), attendanceController.getCurrentBranchAttendance.bind(attendanceController));
router.get('/stats', requireAnyRole(['gym_owner', 'branch_manager', 'auditor']), attendanceController.getAttendanceStats.bind(attendanceController));

export default router;
