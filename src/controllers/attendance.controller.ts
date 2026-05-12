import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import crypto from 'crypto';
import AttendanceService from '../services/attendance.service';
import Attendance from '../models/Attendance.model';
import Member from '../models/Member.model';

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
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const attendance = await AttendanceService.checkIn({
                ...validatedData,
                checkInMethod: validatedData.method,
                tenantId,
                branchId,
            });

            return res.status(201).json({ success: true, data: attendance });
        } catch (error) {
            return next(error);
        }
    }

    async checkOut(req: Request, res: Response, next: NextFunction) {
        try {
            const { attendanceId } = req.params as Record<string, string>;
            const tenantId = req.user!.tenantId!.toString();

            const attendance = await AttendanceService.checkOut(attendanceId, tenantId);

            return res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            return next(error);
        }
    }

    async getMemberAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { startDate, endDate } = req.query;
            const tenantId = req.user!.tenantId!.toString();

            const attendance = await AttendanceService.getMemberAttendance(
                memberId,
                tenantId,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            return next(error);
        }
    }

    async getCurrentBranchAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const branchId = req.user!.branchId?.toString() || '';
            const tenantId = req.user!.tenantId!.toString();

            const attendance = await AttendanceService.getCurrentBranchAttendance(branchId, tenantId);

            return res.status(200).json({ success: true, data: attendance });
        } catch (error) {
            return next(error);
        }
    }

    async getAttendanceStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { branchId, startDate, endDate } = req.query;

            const stats = await AttendanceService.getAttendanceStats(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: stats });
        } catch (error) {
            return next(error);
        }
    }

    async generateQR(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString() || '';
            const token = crypto.randomBytes(16).toString('hex');
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            const qrData = JSON.stringify({ token, tenantId, branchId, expiresAt: expiresAt.toISOString() });
            // Return QR data as string - frontend will generate QR image
            return res.status(200).json({ success: true, data: { qrData, token, expiresAt } });
        } catch (error) { return next(error); }
    }

    async scanQR(req: Request, res: Response, next: NextFunction) {
        try {
            const { qrData } = req.body;
            const user = req.user!;
            let parsed: any;
            try { parsed = JSON.parse(qrData); } catch { return res.status(400).json({ success: false, message: 'Invalid QR data' }); }
            if (new Date(parsed.expiresAt) < new Date()) {
                return res.status(400).json({ success: false, message: 'QR code has expired' });
            }
            const tenantId = parsed.tenantId;
            const branchId = parsed.branchId;
            const member = await Member.findOne({ userId: user._id, tenantId });
            if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
            const attendance = await AttendanceService.checkIn({ memberId: member._id.toString(), checkInMethod: 'qr_code', tenantId, branchId });
            return res.status(200).json({ success: true, data: attendance });
        } catch (error) { return next(error); }
    }

    async getLiveAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString();
            const query: any = { tenantId, checkOutTime: null };
            if (branchId) query.branchId = branchId;
            const live = await Attendance.find(query)
                .populate('memberId', 'firstName lastName avatar membershipNumber')
                .sort({ checkInTime: -1 });
            return res.status(200).json({ success: true, data: { count: live.length, members: live } });
        } catch (error) { return next(error); }
    }

    async getPeakHours(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const peakHours = await Attendance.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), checkInTime: { $gte: thirtyDaysAgo } } },
                { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
                { $sort: { '_id': 1 } }
            ]);
            const hours = Array.from({ length: 24 }, (_, h) => ({
                hour: h,
                label: `${h}:00 - ${h + 1}:00`,
                count: (peakHours.find((p: any) => p._id === h) as any)?.count || 0
            }));
            return res.status(200).json({ success: true, data: hours });
        } catch (error) { return next(error); }
    }

    async getPeakAnalysis(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const days = parseInt(req.query.days as string) || 30;
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const tenantOid = new mongoose.Types.ObjectId(tenantId);

            const [hourlyAgg, dailyAgg] = await Promise.all([
                Attendance.aggregate([
                    { $match: { tenantId: tenantOid, checkInTime: { $gte: since } } },
                    { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                ]),
                Attendance.aggregate([
                    { $match: { tenantId: tenantOid, checkInTime: { $gte: since } } },
                    { $group: { _id: { $dayOfWeek: '$checkInTime' }, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                ]),
            ]);

            const DAY_LABELS = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const hourly = Array.from({ length: 24 }, (_, h) => ({
                hour: h,
                label: `${h}:00`,
                count: (hourlyAgg.find((p: any) => p._id === h) as any)?.count || 0,
            }));
            const daily = Array.from({ length: 7 }, (_, i) => {
                const day = i + 1;
                return { day, label: DAY_LABELS[day], count: (dailyAgg.find((d: any) => d._id === day) as any)?.count || 0 };
            });

            const topHour = hourly.reduce((best, h, i) => h.count > hourly[best].count ? i : best, 0);
            const topDay = daily.reduce((best, d) => d.count > (daily.find(x => x.day === best)?.count || 0) ? d.day : best, 1);

            return res.status(200).json({ success: true, data: { hourly, daily, topHour, topDay } });
        } catch (error) { return next(error); }
    }

    async manualCorrection(req: Request, res: Response, next: NextFunction) {
        try {
            const { attendanceId } = req.params as Record<string, string>;
            const { checkInTime, checkOutTime, notes, reason } = req.body;
            const attendance = await Attendance.findOneAndUpdate(
                { _id: attendanceId, tenantId: req.user!.tenantId },
                {
                    ...(checkInTime && { checkInTime: new Date(checkInTime) }),
                    ...(checkOutTime && { checkOutTime: new Date(checkOutTime) }),
                    notes: `[CORRECTED by ${req.user!.firstName} ${req.user!.lastName}] ${reason || ''}. ${notes || ''}`
                },
                { new: true }
            );
            if (!attendance) return res.status(404).json({ success: false, message: 'Attendance record not found' });
            return res.status(200).json({ success: true, data: attendance });
        } catch (error) { return next(error); }
    }

    async hardwareEntry(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId, direction, timestamp } = req.body;
            const tenantId = req.user!.tenantId!.toString();
            const branchId = req.user!.branchId?.toString() || '';
            if (direction === 'out') {
                const open = await Attendance.findOne({ memberId, tenantId, checkOutTime: null }).sort({ checkInTime: -1 });
                if (open) {
                    const updated = await AttendanceService.checkOut(open._id.toString(), tenantId);
                    return res.status(200).json({ success: true, data: updated });
                }
                return res.status(404).json({ success: false, message: 'No open attendance record found' });
            }
            const attendance = await AttendanceService.checkIn({ memberId, checkInMethod: 'biometric', tenantId, branchId });
            return res.status(200).json({ success: true, data: attendance });
        } catch (error) { return next(error); }
    }

    async getAttendanceRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { page = 1, limit = 50, startDate, endDate, memberId } = req.query;
            const query: any = { tenantId };
            if (startDate || endDate) {
                query.checkInTime = {};
                if (startDate) query.checkInTime.$gte = new Date(startDate as string);
                if (endDate) query.checkInTime.$lte = new Date(endDate as string);
            }
            if (memberId) query.memberId = memberId;
            const skip = (Number(page) - 1) * Number(limit);
            const [records, total] = await Promise.all([
                Attendance.find(query)
                    .populate('memberId', 'firstName lastName membershipNumber')
                    .sort({ checkInTime: -1 })
                    .skip(skip)
                    .limit(Number(limit)),
                Attendance.countDocuments(query)
            ]);
            return res.status(200).json({ success: true, data: { records, total, page: Number(page), limit: Number(limit) } });
        } catch (error) { return next(error); }
    }

    async getUnmatchedAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { page = 1, limit = 50 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const query = { tenantId, memberId: null };
            const [records, total] = await Promise.all([
                Attendance.find(query).sort({ checkInTime: -1 }).skip(skip).limit(Number(limit)),
                Attendance.countDocuments(query)
            ]);
            return res.status(200).json({ success: true, data: { records, total, page: Number(page) } });
        } catch (error) { return next(error); }
    }

    async getTodayAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
            const { branchId } = req.query;
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const query: any = { tenantId, checkInTime: { $gte: startOfDay, $lte: endOfDay } };
            if (branchId) query.branchId = branchId;
            const [records, total, checkedOut] = await Promise.all([
                Attendance.find(query)
                    .populate('memberId', 'firstName lastName membershipNumber profilePhoto')
                    .sort({ checkInTime: -1 })
                    .limit(100),
                Attendance.countDocuments(query),
                Attendance.countDocuments({ ...query, checkOutTime: { $ne: null } }),
            ]);
            return res.status(200).json({
                success: true,
                data: { records, total, checkedIn: total - checkedOut, checkedOut },
            });
        } catch (error) { return next(error); }
    }
}

export default new AttendanceController();

