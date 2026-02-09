import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import AttendanceService from '../services/attendance.service';

const checkInSchema = z.object({
    memberId: z.string(),
    method: z.enum(['manual', 'qr_code', 'rfid', 'biometric', 'mobile_app']),
    classId: z.string().optional(),
    trainerId: z.string().optional(),
    location: z.object({
        latitude: z.number(),
        longitude: z.number(),
    }).optional(),
});

export class AttendanceController {
    async checkIn(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = checkInSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const attendance = await AttendanceService.checkIn({
                ...validatedData,
                tenantId,
                branchId,
            });

            res.status(201).json({ success: true, data: attendance });
        } catch (error) {
            next(error);
        }
    }

    async checkOut(req: Request, res: Response, next: NextFunction) {
        try {
            const { attendanceId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const attendance = await AttendanceService.checkOut(attendanceId, tenantId);

            res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            next(error);
        }
    }

    async getMemberAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params;
            const { startDate, endDate } = req.query;
            const tenantId = req.user!.tenantId.toString();

            const attendance = await AttendanceService.getMemberAttendance(
                memberId,
                tenantId,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            next(error);
        }
    }

    async getCurrentBranchAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const branchId = req.user!.branchId?.toString() || '';
            const tenantId = req.user!.tenantId.toString();

            const attendance = await AttendanceService.getCurrentBranchAttendance(branchId, tenantId);

            res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            next(error);
        }
    }

    async getAttendanceStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, startDate, endDate } = req.query;

            const stats = await AttendanceService.getAttendanceStats(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }
}

export default new AttendanceController();
