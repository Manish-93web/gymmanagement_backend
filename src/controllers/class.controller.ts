import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import ClassService from '../services/class.service';

const createClassSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['group_class', 'pt_session', 'online_class']),
    trainerId: z.string(),
    schedule: z.object({
        startTime: z.string(),
        endTime: z.string(),
        recurring: z.boolean().optional(),
    }),
    capacity: z.object({
        min: z.number().min(1),
        max: z.number().min(1),
    }),
    pricing: z.object({
        dropInPrice: z.number().min(0),
        memberPrice: z.number().min(0).optional(),
    }),
});

const createBookingSchema = z.object({
    memberId: z.string(),
    classId: z.string(),
    bookingType: z.enum(['regular', 'trial', 'drop_in']),
});

export class ClassController {
    async createClass(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createClassSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const classDoc = await ClassService.createClass({
                ...validatedData,
                tenantId,
                branchId,
                schedule: {
                    ...validatedData.schedule,
                    startTime: new Date(validatedData.schedule.startTime),
                    endTime: new Date(validatedData.schedule.endTime),
                },
            });

            res.status(201).json({ success: true, data: classDoc });
        } catch (error) {
            next(error);
        }
    }

    async getClasses(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, type, trainerId, startDate, endDate } = req.query;

            const classes = await ClassService.getClasses(
                tenantId,
                branchId as string,
                type as any,
                trainerId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({ success: true, data: classes });
        } catch (error) {
            next(error);
        }
    }

    async getClassById(req: Request, res: Response, next: NextFunction) {
        try {
            const { classId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const classDoc = await ClassService.getClassById(classId, tenantId);

            if (!classDoc) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }

            res.status(200).json({ success: true, data: classDoc });
        } catch (error) {
            next(error);
        }
    }

    async updateClass(req: Request, res: Response, next: NextFunction) {
        try {
            const { classId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const classDoc = await ClassService.updateClass(classId, tenantId, req.body);

            res.status(200).json({ success: true, data: classDoc });
        } catch (error) {
            next(error);
        }
    }

    async createBooking(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createBookingSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const booking = await ClassService.createBooking({
                ...validatedData,
                tenantId,
                branchId,
            });

            res.status(201).json({ success: true, data: booking });
        } catch (error) {
            next(error);
        }
    }

    async cancelBooking(req: Request, res: Response, next: NextFunction) {
        try {
            const { bookingId } = req.params;
            const { reason } = req.body;
            const tenantId = req.user!.tenantId.toString();

            const booking = await ClassService.cancelBooking(bookingId, reason, tenantId);

            res.status(200).json({ success: true, data: booking });
        } catch (error) {
            next(error);
        }
    }

    async markAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const { bookingId } = req.params;
            const { attended } = req.body;
            const tenantId = req.user!.tenantId.toString();

            const booking = await ClassService.markAttendance(bookingId, attended, tenantId);

            res.status(200).json({ success: true, data: booking });
        } catch (error) {
            next(error);
        }
    }

    async getMemberBookings(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const bookings = await ClassService.getMemberBookings(memberId, tenantId);

            res.status(200).json({ success: true, data: bookings });
        } catch (error) {
            next(error);
        }
    }
}

export default new ClassController();
