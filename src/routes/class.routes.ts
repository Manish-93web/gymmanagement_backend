import { Router } from 'express';
import classController from '../controllers/class.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Class routes
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'trainer'), classController.createClass.bind(classController));
router.get('/', authenticate, classController.getClasses.bind(classController));
router.get('/:classId', authenticate, classController.getClassById.bind(classController));
router.put('/:classId', requireAnyRole('gym_owner', 'branch_manager', 'trainer'), classController.updateClass.bind(classController));

// Booking routes
router.post('/bookings', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member'), classController.createBooking.bind(classController));
router.post('/bookings/:bookingId/cancel', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member'), classController.cancelBooking.bind(classController));
router.post('/bookings/:bookingId/attendance', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer'), classController.markAttendance.bind(classController));
router.get('/bookings/member/:memberId', authenticate, classController.getMemberBookings.bind(classController));

export default router;
