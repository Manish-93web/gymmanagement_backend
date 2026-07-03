import { Router, Request, Response } from 'express';
import classController from '../controllers/class.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { videoService } from '../services/video.service';
import ClassModel from '../models/Class.model';

const router = Router();

router.use(authenticate);

// Static routes first (must be before /:classId param routes)
router.get('/categories', authenticate, classController.getCategories.bind(classController));
router.get('/my-bookings', authenticate, classController.getMyBookings.bind(classController));
router.get('/me/bookings', authenticate, classController.getMyBookings.bind(classController));
router.get('/occurrences', authenticate, classController.getAllOccurrences.bind(classController));
router.post('/bookings', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'super_admin'), classController.createBooking.bind(classController));
router.post('/bookings/:bookingId/cancel', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'super_admin'), classController.cancelBooking.bind(classController));
router.post('/bookings/:bookingId/attendance', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'), classController.markAttendance.bind(classController));
router.get('/bookings/member/:memberId', authenticate, classController.getMemberBookings.bind(classController));

// Class CRUD routes
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), classController.createClass.bind(classController));
router.get('/', authenticate, classController.getClasses.bind(classController));

// Parameterized routes (after static routes)
router.get('/:classId/bookings', authenticate, classController.getClassBookings.bind(classController));
router.get('/:classId/occurrences', authenticate, classController.getClassOccurrences.bind(classController));
router.get('/:classId', authenticate, classController.getClassById.bind(classController));
router.put('/:classId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), classController.updateClass.bind(classController));
router.delete('/:classId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), classController.deleteClass.bind(classController));

// Video meeting for a class (gymvideo server)
router.post('/:classId/zoom', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { topic } = req.body;
        const classId = req.params.classId;
        const result = await videoService.createRoom(classId, topic || 'Gym Class');

        await ClassModel.findByIdAndUpdate(classId, {
            'online.isOnline': true,
            'online.platform': 'gymvideo',
            'online.meetingLink': result.joinUrl,
            'online.meetingId': result.roomId,
            'online.password': '',
        });

        res.json({ success: true, meetingLink: result.joinUrl, meetingId: result.roomId });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/:classId/zoom/:meetingId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await videoService.deleteRoom(req.params.meetingId);
        await ClassModel.findByIdAndUpdate(req.params.classId, {
            $unset: { 'online.meetingLink': 1, 'online.meetingId': 1, 'online.platform': 1 },
            'online.isOnline': false,
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
