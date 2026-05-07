import { Router } from 'express';
import attendanceController from '../controllers/attendance.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.checkIn.bind(attendanceController));
router.post('/:attendanceId/checkout', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.checkOut.bind(attendanceController));
router.get('/member/:memberId', authenticate, attendanceController.getMemberAttendance.bind(attendanceController));
router.get('/current', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.getCurrentBranchAttendance.bind(attendanceController));
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'auditor', 'super_admin'), attendanceController.getAttendanceStats.bind(attendanceController));
router.post('/qr/generate', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.generateQR.bind(attendanceController));
router.get('/qr/generate', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'super_admin'), attendanceController.generateQR.bind(attendanceController));
router.post('/qr/scan', attendanceController.scanQR.bind(attendanceController));
router.get('/live', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.getLiveAttendance.bind(attendanceController));
router.get('/peak-hours', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), attendanceController.getPeakHours.bind(attendanceController));
router.post('/records/:attendanceId/correct', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), attendanceController.manualCorrection.bind(attendanceController));
router.post('/hardware-entry', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), attendanceController.hardwareEntry.bind(attendanceController));
router.get('/records', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'), attendanceController.getAttendanceRecords.bind(attendanceController));
router.get('/unmatched', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), attendanceController.getUnmatchedAttendance.bind(attendanceController));

export default router;
