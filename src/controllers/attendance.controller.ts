import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import AttendanceService from '../services/attendance.service';
import Attendance from '../models/Attendance.model';

class AttendanceController {
    // POST /
    async checkIn(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.branchId;
            const { memberId, checkInMethod, classId, trainerId, location } = req.body;

            if (!memberId) {
                return res.status(400).json({ success: false, message: 'memberId is required' });
            }
            if (!checkInMethod) {
                return res.status(400).json({ success: false, message: 'checkInMethod is required' });
            }
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch context required' });
            }

            const attendance = await AttendanceService.checkIn({
                tenantId,
                branchId,
                memberId,
                checkInMethod,
                classId,
                trainerId,
                location,
            });

            return res.status(201).json({ success: true, data: attendance });
        } catch (error: any) {
            if (
                error.message === 'Member not found' ||
                error.message === 'Member is not active' ||
                error.message === 'No active subscription found' ||
                error.message === 'Member is already checked in'
            ) {
                return res.status(400).json({ success: false, message: error.message });
            }
            return next(error);
        }
    }

    // POST /:attendanceId/checkout
    async checkOut(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const attendanceId = String(req.params.attendanceId);

            const attendance = await AttendanceService.checkOut(attendanceId, tenantId);

            return res.status(200).json({ success: true, data: attendance });
        } catch (error: any) {
            if (
                error.message === 'Attendance record not found' ||
                error.message === 'Member is already checked out'
            ) {
                return res.status(400).json({ success: false, message: error.message });
            }
            return next(error);
        }
    }

    // GET /member/:memberId
    async getMemberAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const memberId = String(req.params.memberId);
            const { startDate, endDate, page = '1', limit = '20' } = req.query;

            const result = await AttendanceService.getMemberAttendance(
                memberId,
                tenantId,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined,
                parseInt(page as string, 10),
                parseInt(limit as string, 10)
            );

            return res.status(200).json({
                success: true,
                data: result.attendance,
                pagination: {
                    total: result.total,
                    page: parseInt(page as string, 10),
                    limit: parseInt(limit as string, 10),
                    pages: Math.ceil(result.total / parseInt(limit as string, 10)),
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /current
    async getCurrentBranchAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = (req.query.branchId as string) || req.branchId;
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch context required' });
            }

            const attendance = await AttendanceService.getCurrentBranchAttendance(tenantId, branchId);

            return res.status(200).json({ success: true, data: attendance, count: attendance.length });
        } catch (error) {
            return next(error);
        }
    }

    // GET /stats
    async getAttendanceStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { branchId, startDate, endDate } = req.query;

            const stats = await AttendanceService.getAttendanceStats(
                tenantId,
                branchId as string | undefined,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: stats });
        } catch (error) {
            return next(error);
        }
    }

    // POST /qr/generate  OR  GET /qr/generate
    async generateQR(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.branchId;

            const secret = process.env.JWT_SECRET || 'default_secret';
            const token = jwt.sign(
                { tenantId, branchId },
                secret,
                { expiresIn: '15m' }
            );

            return res.status(200).json({
                success: true,
                data: {
                    token,
                    expiresIn: 900, // 15 minutes in seconds
                    qrData: token,
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // POST /qr/scan
    async scanQR(req: Request, res: Response, next: NextFunction) {
        try {
            const { token, memberId, checkInMethod } = req.body;

            if (!token) {
                return res.status(400).json({ success: false, message: 'QR token is required' });
            }
            if (!memberId) {
                return res.status(400).json({ success: false, message: 'memberId is required' });
            }

            const secret = process.env.JWT_SECRET || 'default_secret';
            let decoded: any;
            try {
                decoded = jwt.verify(token, secret) as { tenantId: string; branchId?: string };
            } catch {
                return res.status(400).json({ success: false, message: 'Invalid or expired QR code' });
            }

            const { tenantId, branchId } = decoded;

            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Invalid QR token: missing tenant' });
            }
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Invalid QR token: missing branch' });
            }

            const attendance = await AttendanceService.checkIn({
                tenantId,
                branchId,
                memberId,
                checkInMethod: checkInMethod || 'qr_code',
            });

            return res.status(201).json({ success: true, data: attendance });
        } catch (error: any) {
            if (
                error.message === 'Member not found' ||
                error.message === 'Member is not active' ||
                error.message === 'No active subscription found' ||
                error.message === 'Member is already checked in'
            ) {
                return res.status(400).json({ success: false, message: error.message });
            }
            return next(error);
        }
    }

    // GET /live
    async getLiveAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });
            const branchId = req.branchId;
            const query: any = { tenantId, checkOutTime: null };
            if (branchId) query.branchId = branchId;
            const live = await Attendance.find(query)
                .populate('memberId', 'firstName lastName avatar membershipNumber')
                .sort({ checkInTime: -1 });
            return res.status(200).json({ success: true, data: { count: live.length, members: live } });
        } catch (error) { return next(error); }
    }

    // GET /peak-hours
    async getPeakHours(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const peakHours = await Attendance.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), checkInTime: { $gte: thirtyDaysAgo } } },
                { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
                { $sort: { '_id': 1 } }
            ]);
            return res.status(200).json({ success: true, data: peakHours.map(h => ({ hour: h._id, count: h.count })) });
        } catch (error) { return next(error); }
    }

    // GET /peak-analysis
    async getPeakAnalysis(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { branchId, days = '30' } = req.query;
            const daysAgo = new Date(Date.now() - parseInt(days as string, 10) * 24 * 60 * 60 * 1000);

            const matchFilter: any = {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                checkInTime: { $gte: daysAgo },
            };
            if (branchId) matchFilter.branchId = new mongoose.Types.ObjectId(branchId as string);

            const [hourly, daily] = await Promise.all([
                Attendance.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: { hour: { $hour: '$checkInTime' }, dayOfWeek: { $dayOfWeek: '$checkInTime' } },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { count: -1 } },
                ]),
                Attendance.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInTime' } },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { _id: 1 } },
                ]),
            ]);

            const peakHourData = hourly.map(h => ({
                hour: h._id.hour,
                dayOfWeek: h._id.dayOfWeek,
                count: h.count,
            }));

            const dailyData = daily.map(d => ({
                date: d._id,
                count: d.count,
            }));

            const busiestHour = peakHourData.reduce(
                (max, h) => (h.count > max.count ? h : max),
                { hour: 0, dayOfWeek: 0, count: 0 }
            );

            return res.status(200).json({
                success: true,
                data: {
                    hourlyBreakdown: peakHourData,
                    dailyTrend: dailyData,
                    busiestHour,
                    period: { days: parseInt(days as string, 10), from: daysAgo },
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // POST /records/:attendanceId/correct
    async manualCorrection(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const attendanceId = String(req.params.attendanceId);
            const { checkInTime, checkOutTime, notes } = req.body;

            const attendance = await Attendance.findOne({ _id: attendanceId, tenantId });
            if (!attendance) {
                return res.status(404).json({ success: false, message: 'Attendance record not found' });
            }

            const updates: any = { recordedBy: req.user?._id };
            if (checkInTime) updates.checkInTime = new Date(checkInTime);
            if (checkOutTime) updates.checkOutTime = new Date(checkOutTime);
            if (notes !== undefined) updates.notes = notes;

            // Recalculate duration if both times are available
            const newCheckIn = checkInTime ? new Date(checkInTime) : attendance.checkInTime;
            const newCheckOut = checkOutTime ? new Date(checkOutTime) : attendance.checkOutTime;
            if (newCheckIn && newCheckOut) {
                updates.duration = Math.floor((newCheckOut.getTime() - newCheckIn.getTime()) / 60000);
            }

            const updated = await Attendance.findByIdAndUpdate(
                attendanceId,
                { $set: updates },
                { new: true, runValidators: true }
            );

            return res.status(200).json({ success: true, data: updated });
        } catch (error) {
            return next(error);
        }
    }

    // POST /hardware-entry
    async hardwareEntry(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.branchId;
            const { memberId, deviceId, checkInTime, checkOutTime, method } = req.body;

            if (!memberId) {
                return res.status(400).json({ success: false, message: 'memberId is required' });
            }
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch context required' });
            }

            // If checkOutTime is provided, this is a complete record; otherwise it's just check-in
            const attendanceData: any = {
                tenantId,
                branchId,
                memberId,
                checkInTime: checkInTime ? new Date(checkInTime) : new Date(),
                method: method || 'rfid',
                deviceId,
            };

            if (checkOutTime) {
                attendanceData.checkOutTime = new Date(checkOutTime);
                attendanceData.duration = Math.floor(
                    (attendanceData.checkOutTime.getTime() - attendanceData.checkInTime.getTime()) / 60000
                );
            }

            const attendance = await Attendance.create(attendanceData);

            return res.status(201).json({ success: true, data: attendance });
        } catch (error) {
            return next(error);
        }
    }

    // GET /records
    async getAttendanceRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const {
                branchId,
                memberId,
                startDate,
                endDate,
                method,
                page = '1',
                limit = '20',
            } = req.query;

            const filter: any = { tenantId };
            if (branchId) filter.branchId = branchId;
            if (memberId) filter.memberId = memberId;
            if (method) filter.method = method;
            if (startDate || endDate) {
                filter.checkInTime = {};
                if (startDate) filter.checkInTime.$gte = new Date(startDate as string);
                if (endDate) filter.checkInTime.$lte = new Date(endDate as string);
            }

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const skip = (pageNum - 1) * limitNum;

            const [records, total] = await Promise.all([
                Attendance.find(filter)
                    .skip(skip)
                    .limit(limitNum)
                    .sort({ checkInTime: -1 })
                    .populate('memberId', 'firstName lastName membershipNumber'),
                Attendance.countDocuments(filter),
            ]);

            return res.status(200).json({
                success: true,
                data: records,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /unmatched
    async getUnmatchedAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { branchId, startDate, endDate, page = '1', limit = '20' } = req.query;

            // "Unmatched" records are those where check-in has no corresponding check-out
            // and the record is older than a reasonable threshold (e.g. > 12 hours without checkout)
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

            const filter: any = {
                tenantId,
                checkOutTime: null,
                checkInTime: { $lte: twelveHoursAgo },
            };
            if (branchId) filter.branchId = branchId;
            if (startDate) filter.checkInTime.$gte = new Date(startDate as string);
            if (endDate) filter.checkInTime.$lte = new Date(endDate as string);

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const skip = (pageNum - 1) * limitNum;

            const [records, total] = await Promise.all([
                Attendance.find(filter)
                    .skip(skip)
                    .limit(limitNum)
                    .sort({ checkInTime: -1 })
                    .populate('memberId', 'firstName lastName membershipNumber'),
                Attendance.countDocuments(filter),
            ]);

            return res.status(200).json({
                success: true,
                data: records,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /today
    async getTodayAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const { branchId } = req.query;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const filter: any = {
                tenantId,
                checkInTime: { $gte: todayStart, $lte: todayEnd },
            };
            if (branchId) filter.branchId = branchId;
            else if (req.branchId) filter.branchId = req.branchId;

            const [records, total, currentlyIn] = await Promise.all([
                Attendance.find(filter)
                    .sort({ checkInTime: -1 })
                    .populate('memberId', 'firstName lastName membershipNumber avatar'),
                Attendance.countDocuments(filter),
                Attendance.countDocuments({ ...filter, checkOutTime: null }),
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    records,
                    total,
                    currentlyIn,
                    date: todayStart,
                },
            });
        } catch (error) {
            return next(error);
        }
    }
}

export default new AttendanceController();
