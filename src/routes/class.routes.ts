import { Router, Request, Response } from 'express';
import classController from '../controllers/class.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { videoService } from '../services/video.service';
import ClassModel from '../models/Class.model';
import BookingModel from '../models/Booking.model';
import notificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);

// Static routes first (must be before /:classId param routes)
router.get('/categories', authenticate, classController.getCategories.bind(classController));
router.post('/categories', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), classController.createCategory.bind(classController));
router.get('/my-bookings', authenticate, classController.getMyBookings.bind(classController));
router.get('/me/bookings', authenticate, classController.getMyBookings.bind(classController));
router.get('/occurrences', authenticate, classController.getAllOccurrences.bind(classController));
router.post('/bookings', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'super_admin'), classController.createBooking.bind(classController));
router.post('/bookings/:bookingId/cancel', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'member', 'super_admin'), classController.cancelBooking.bind(classController));
router.post('/bookings/:bookingId/attendance', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'), classController.markAttendance.bind(classController));
router.get('/bookings/member/:memberId', authenticate, classController.getMemberBookings.bind(classController));

// GymFlow Video platform health check — signaling is built into this backend
router.get('/gymvideo/health', authenticate, async (_req: Request, res: Response) => {
    const health = await videoService.getServerHealth();
    res.json({ success: true, data: { online: health.online, serverUrl: health.serverUrl.replace(/\/$/, '') } });
});

// Class CRUD routes
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), classController.createClass.bind(classController));
router.get('/', authenticate, classController.getClasses.bind(classController));

// Parameterized routes (after static routes)
router.get('/:classId/bookings', authenticate, classController.getClassBookings.bind(classController));
router.get('/:classId/occurrences', authenticate, classController.getClassOccurrences.bind(classController));

// Waitlist — notify a waitlisted member that a spot may be opening up
router.post('/:classId/waitlist/:bookingId/notify', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { classId, bookingId } = req.params;
        const booking = await BookingModel.findOne({ _id: bookingId, classId, status: 'waitlist' }).lean();
        if (!booking) { res.status(404).json({ success: false, message: 'Waitlist entry not found' }); return; }

        const cls = await ClassModel.findById(classId).select('name').lean();
        const className = (cls as any)?.name ?? 'the class';

        try {
            await notificationService.sendNotification({
                tenantId: (booking as any).tenantId?.toString() ?? '',
                branchId: (booking as any).branchId?.toString() ?? '',
                recipientId: (booking as any).memberId?.toString() ?? '',
                recipientType: 'member',
                channel: 'push',
                message: `A spot may be opening up in ${className}. Stay ready — you'll be confirmed automatically if one frees up.`,
                subject: `Waitlist Update — ${className}`,
                data: { classId, bookingId, type: 'waitlist_notify' },
            });
        } catch (_notifyErr) {}

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Waitlist — manually promote a waitlisted booking straight to confirmed
router.post('/:classId/waitlist/:bookingId/promote', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { classId, bookingId } = req.params;
        const booking = await BookingModel.findOne({ _id: bookingId, classId, status: 'waitlist' });
        if (!booking) { res.status(404).json({ success: false, message: 'Waitlist entry not found' }); return; }

        booking.status = 'confirmed';
        booking.set('waitlistPosition', undefined);
        await booking.save();

        await ClassModel.findByIdAndUpdate(classId, { $inc: { 'capacity.current': 1 } });

        res.json({ success: true, data: booking });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Video status — returns whether the class has an active gymvideo room
router.get('/:classId/video-status', authenticate, async (req: Request, res: Response) => {
    try {
        const cls = await ClassModel.findById(req.params.classId).select('online name').lean();
        if (!cls) {
            res.status(404).json({ success: false, message: 'Class not found' });
            return;
        }
        const online = (cls as any).online ?? {};
        res.json({
            success: true,
            data: {
                isLive: !!online.meetingLink,
                platform: online.platform ?? null,
                meetingLink: online.meetingLink ?? null,
                meetingId: online.meetingId ?? null,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Materials — list
router.get('/:classId/materials', authenticate, async (req: Request, res: Response) => {
    try {
        const cls = await ClassModel.findById(req.params.classId).select('materials name').lean();
        if (!cls) { res.status(404).json({ success: false, message: 'Class not found' }); return; }
        res.json({ success: true, data: { materials: (cls as any).materials ?? [] } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Materials — add
router.post('/:classId/materials', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { type, title, url, content } = req.body;
        if (!title?.trim()) { res.status(400).json({ success: false, message: 'Title is required' }); return; }
        const cls = await ClassModel.findByIdAndUpdate(
            req.params.classId,
            { $push: { materials: { type: type ?? 'video_url', title: title.trim(), url: url?.trim() || undefined, content: content?.trim() || undefined } } },
            { new: true }
        ).select('materials');
        if (!cls) { res.status(404).json({ success: false, message: 'Class not found' }); return; }
        const mats = (cls as any).materials ?? [];
        res.json({ success: true, data: mats[mats.length - 1] });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Materials — delete one by subdocument _id
router.delete('/:classId/materials/:matId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await ClassModel.findByIdAndUpdate(
            req.params.classId,
            { $pull: { materials: { _id: req.params.matId } } } as any
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Recordings — list
router.get('/:classId/recordings', authenticate, async (req: Request, res: Response) => {
    try {
        const cls = await ClassModel.findById(req.params.classId).select('recordings name').lean();
        if (!cls) {
            res.status(404).json({ success: false, message: 'Class not found' });
            return;
        }
        res.json({
            success: true,
            data: { recordings: (cls as any).recordings ?? [], className: (cls as any).name },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:classId', authenticate, classController.getClassById.bind(classController));
router.put('/:classId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), classController.updateClass.bind(classController));
router.delete('/:classId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), classController.deleteClass.bind(classController));

// Video meeting for a class (gymvideo server)
router.post('/:classId/zoom', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { topic } = req.body;
        const classId = req.params.classId as string;

        // Fetch class with trainer info, session duration, and existing online config (e.g. password)
        // Trainer.firstName/lastName don't exist on the Trainer model — the
        // name lives on the linked User document, so populate through it.
        const cls = await ClassModel.findById(classId)
            .select('name schedule trainerId online videoConfig')
            .populate<{ trainerId: { userId?: { firstName?: string; lastName?: string } } | null }>({
                path: 'trainerId',
                select: 'userId',
                populate: { path: 'userId', select: 'firstName lastName' },
            })
            .lean();

        const durationMinutes: number = (cls as any)?.schedule?.duration ?? 60;
        const trainer = (cls as any)?.trainerId as { userId?: { firstName?: string; lastName?: string } } | null;
        const trainerUser = trainer?.userId;
        const trainerFromClass = trainerUser
            ? `${trainerUser.firstName ?? ''} ${trainerUser.lastName ?? ''}`.trim()
            : '';

        // Fall back to the requesting user's name (e.g. gym owner starting the room)
        const reqUser = (req as any).user;
        const trainerName =
            trainerFromClass ||
            (reqUser ? `${reqUser.firstName ?? ''} ${reqUser.lastName ?? ''}`.trim() : '') ||
            undefined;

        const vc = (cls as any)?.videoConfig ?? {};
        const existingPassword: string = (cls as any)?.online?.password ?? '';
        const result = await videoService.createRoom(
            classId,
            topic || (cls as any)?.name || 'Gym Class',
            trainerName || undefined,
            durationMinutes,
            {
                defaultAudio: vc.defaultAudio !== false,
                defaultVideo: vc.defaultVideo !== false,
                trainerAutoScreen: !!vc.trainerAutoScreen,
                password: existingPassword || undefined,
            },
        );
        await ClassModel.findByIdAndUpdate(classId, {
            'online.isOnline': true,
            'online.platform': 'gymvideo',
            'online.meetingLink': result.joinUrl,
            'online.meetingId': result.roomId,
            'online.hostUrl': result.hostUrl,
            // Preserve existing password set at class creation; don't overwrite
        });

        // Notify all confirmed members that the class is now live
        try {
            const bookings = await BookingModel.find({ classId, status: 'confirmed' })
                .select('memberId tenantId branchId').lean();
            const className = (cls as any)?.name ?? 'Your class';
            const pwdNote = existingPassword ? ` Password: ${existingPassword}` : '';
            await Promise.allSettled(
                bookings.map((b: any) =>
                    notificationService.sendNotification({
                        tenantId: b.tenantId?.toString() ?? '',
                        branchId: b.branchId?.toString() ?? '',
                        recipientId: b.memberId?.toString() ?? '',
                        recipientType: 'member',
                        channel: 'push',
                        message: `${className} is now LIVE! Join: ${result.joinUrl}${pwdNote}`,
                        subject: `${className} is Live Now!`,
                        data: { classId, meetingLink: result.joinUrl, type: 'class_live' },
                    }),
                ),
            );
        } catch (_notifyErr) {}

        res.json({
            success: true,
            meetingLink: result.joinUrl,
            hostUrl: result.hostUrl,
            meetingId: result.roomId,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/:classId/zoom/:meetingId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const classId = req.params.classId as string;
        const cls = await ClassModel.findById(classId).select('name').lean();
        await videoService.deleteRoom(req.params.meetingId as string);
        await ClassModel.findByIdAndUpdate(classId, {
            $unset: { 'online.meetingLink': 1, 'online.meetingId': 1, 'online.platform': 1, 'online.hostUrl': 1 },
            'online.isOnline': false,
        });
        // Notify booked members that the class has ended
        try {
            const bookings = await BookingModel.find({ classId, status: 'confirmed' })
                .select('memberId tenantId branchId').lean();
            const className = (cls as any)?.name ?? 'Your class';
            await Promise.allSettled(
                bookings.map((b: any) =>
                    notificationService.sendNotification({
                        tenantId: b.tenantId?.toString() ?? '',
                        branchId: b.branchId?.toString() ?? '',
                        recipientId: b.memberId?.toString() ?? '',
                        recipientType: 'member',
                        channel: 'push',
                        message: `${className} has ended. Check the Recordings section for a replay.`,
                        subject: `${className} — Session Ended`,
                        data: { classId, type: 'class_ended' },
                    }),
                ),
            );
        } catch (_notifyErr) {}
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Session lifecycle — log start and end of live sessions
router.post('/:classId/session/start', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id ?? (req as any).user?.id;
        const cls = await ClassModel.findByIdAndUpdate(
            req.params.classId,
            { $push: { sessionHistory: { startedAt: new Date(), startedBy: userId } } },
            { new: true },
        ).select('sessionHistory');
        if (!cls) { res.status(404).json({ success: false, message: 'Class not found' }); return; }
        const sessions = (cls as any).sessionHistory ?? [];
        res.json({ success: true, data: sessions[sessions.length - 1] });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:classId/session/end', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { durationMinutes } = req.body;
        const cls = await ClassModel.findById(req.params.classId).select('sessionHistory');
        if (!cls) { res.status(404).json({ success: false, message: 'Class not found' }); return; }
        const sessions: any[] = (cls as any).sessionHistory ?? [];
        const last = sessions[sessions.length - 1];
        if (last && !last.endedAt) {
            last.endedAt = new Date();
            last.durationMinutes = durationMinutes ?? Math.round((Date.now() - new Date(last.startedAt).getTime()) / 60000);
            await cls.save();
        }
        res.json({ success: true, data: last });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:classId/session', authenticate, async (req: Request, res: Response) => {
    try {
        const cls = await ClassModel.findById(req.params.classId).select('sessionHistory').lean();
        if (!cls) { res.status(404).json({ success: false, message: 'Class not found' }); return; }
        res.json({ success: true, data: { sessions: (cls as any).sessionHistory ?? [] } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Join token — short-lived JWT so members can securely authenticate with the video server
router.get('/:classId/join-token', authenticate, async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;
        const userId = (req as any).user?._id?.toString() ?? '';
        const role = (req as any).user?.role ?? 'member';
        const tenantId = (req as any).tenantId ?? (req as any).user?.tenantId?.toString() ?? '';
        // Verify class exists and is live (optional security check)
        const cls = await ClassModel.findById(classId).select('online name').lean();
        if (!cls) {
            res.status(404).json({ success: false, message: 'Class not found' });
            return;
        }
        const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'gymflow-join-secret-change-in-production';
        const jsonwebtoken = require('jsonwebtoken');
        const token = jsonwebtoken.sign(
            { classId, userId, role, tenantId },
            secret,
            { expiresIn: '2h' },
        );
        res.json({ success: true, data: { token, expiresIn: '2h' } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Recordings — save new recording metadata after a session
router.post('/:classId/recordings', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { title, date, duration, url } = req.body;
        const userId = (req as any).user?._id ?? (req as any).user?.id;
        const cls = await ClassModel.findByIdAndUpdate(
            req.params.classId,
            { $push: { recordings: { title, date: date ?? new Date(), duration, url, uploadedBy: userId } } },
            { new: true }
        ).select('recordings');
        if (!cls) {
            res.status(404).json({ success: false, message: 'Class not found' });
            return;
        }
        const recs = (cls as any).recordings ?? [];
        res.json({ success: true, data: recs[recs.length - 1] });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Recordings — delete one recording by its subdocument _id
router.delete('/:classId/recordings/:recId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await ClassModel.findByIdAndUpdate(
            req.params.classId,
            { $pull: { recordings: { _id: req.params.recId } } } as any
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
