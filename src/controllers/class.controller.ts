import { Request, Response, NextFunction } from 'express';
import ClassService from '../services/class.service';
import Class from '../models/Class.model';
import Booking from '../models/Booking.model';

class ClassController {
    // POST /
    async createClass(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.body.branchId || req.branchId;
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch context required' });
            }

            const {
                name,
                description,
                classType,
                type,
                trainerId,
                category,
                level,
                schedule,
                capacity,
                pricing,
                online,
                cancellationPolicy,
                zoomMeetingId,
            } = req.body;

            if (!name) return res.status(400).json({ success: false, message: 'name is required' });
            if (!trainerId) return res.status(400).json({ success: false, message: 'trainerId is required' });
            if (!schedule) return res.status(400).json({ success: false, message: 'schedule is required' });
            if (!capacity) return res.status(400).json({ success: false, message: 'capacity is required' });

            const resolvedType = classType || type;
            if (!resolvedType) return res.status(400).json({ success: false, message: 'classType is required' });
            if (!category) return res.status(400).json({ success: false, message: 'category is required' });

            const classDoc = await ClassService.createClass({
                tenantId,
                branchId,
                name,
                description,
                classType: resolvedType,
                trainerId,
                schedule,
                capacity,
                pricing,
                zoomMeetingId,
            });

            return res.status(201).json({ success: true, data: classDoc });
        } catch (error) {
            return next(error);
        }
    }

    // GET /
    async getClasses(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const {
                branchId,
                classType,
                type,
                trainerId,
                startDate,
                endDate,
                search,
                page = '1',
                limit = '20',
            } = req.query;

            const resolvedBranchId = (branchId as string) || req.branchId;
            const resolvedType = (classType as string) || (type as string);

            const result = await ClassService.getClasses(
                tenantId,
                resolvedBranchId,
                resolvedType as any,
                trainerId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined,
                search as string,
                parseInt(page as string, 10),
                parseInt(limit as string, 10)
            );

            return res.status(200).json({
                success: true,
                data: { classes: result.classes, total: result.total },
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

    // GET /my-bookings
    async getMyBookings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            const { status, page = '1', limit = '20' } = req.query;

            // For member role, look up their memberId by user._id
            // For other roles, filter by userId on booking or return their managed bookings
            const filter: any = { tenantId };

            // Attempt to find memberId linked to this user
            const Member = require('../models/Member.model').default;
            const member = await Member.findOne({ userId: req.user._id, tenantId });

            if (member) {
                filter.memberId = member._id;
            } else {
                // Non-member user: return empty or filter by branchId if manager/staff
                if (req.branchId) filter.branchId = req.branchId;
            }

            if (status) filter.status = status;

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const skip = (pageNum - 1) * limitNum;

            const [bookings, total] = await Promise.all([
                Booking.find(filter)
                    .skip(skip)
                    .limit(limitNum)
                    .sort({ bookingDate: -1 })
                    .populate('classId'),
                Booking.countDocuments(filter),
            ]);

            return res.status(200).json({
                success: true,
                data: bookings,
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

    // GET /:classId
    async getClassById(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const classId = String(req.params.classId);

            const classDoc = await ClassService.getClassById(classId, tenantId);
            if (!classDoc) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }

            return res.status(200).json({ success: true, data: classDoc });
        } catch (error) {
            return next(error);
        }
    }

    // PUT /:classId
    async updateClass(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const classId = String(req.params.classId);
            const updates = req.body;

            // Remove fields that must not be updated directly
            delete updates.tenantId;
            delete updates._id;

            const updated = await ClassService.updateClass(classId, tenantId, updates);
            if (!updated) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }

            return res.status(200).json({ success: true, data: updated });
        } catch (error) {
            return next(error);
        }
    }

    // DELETE /:classId
    async deleteClass(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const classId = String(req.params.classId);
            const { reason } = req.body;

            const cancelled = await ClassService.cancelClass(
                classId,
                tenantId,
                reason || 'Class removed by administrator'
            );

            if (!cancelled) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }

            return res.status(200).json({ success: true, message: 'Class cancelled and removed successfully' });
        } catch (error) {
            return next(error);
        }
    }

    // POST /bookings
    async createBooking(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const branchId = req.body.branchId || req.branchId;
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch context required' });
            }

            const { classId, memberId, bookingType, paymentStatus } = req.body;

            if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });
            if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });

            const booking = await ClassService.createBooking({
                tenantId,
                branchId,
                classId,
                memberId,
                bookingType: bookingType || 'regular',
                paymentStatus: paymentStatus || 'pending',
            });

            const statusCode = booking.status === 'waitlist' ? 200 : 201;
            return res.status(statusCode).json({ success: true, data: booking });
        } catch (error: any) {
            if (error.message === 'Class not found') {
                return res.status(404).json({ success: false, message: error.message });
            }
            return next(error);
        }
    }

    // POST /bookings/:bookingId/cancel
    async cancelBooking(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const bookingId = String(req.params.bookingId);
            const { reason } = req.body;

            const booking = await ClassService.cancelBooking(
                bookingId,
                tenantId,
                reason || 'Cancelled by user'
            );

            if (!booking) {
                return res.status(404).json({ success: false, message: 'Booking not found' });
            }

            return res.status(200).json({ success: true, data: booking });
        } catch (error: any) {
            if (
                error.message === 'Booking not found' ||
                error.message === 'Booking already cancelled' ||
                error.message === 'Class not found'
            ) {
                return res.status(400).json({ success: false, message: error.message });
            }
            return next(error);
        }
    }

    // POST /bookings/:bookingId/attendance
    async markAttendance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const bookingId = String(req.params.bookingId);
            const { attended } = req.body;

            if (attended === undefined) {
                return res.status(400).json({ success: false, message: 'attended (boolean) is required' });
            }

            const booking = await ClassService.markAttendance(bookingId, tenantId, Boolean(attended));
            if (!booking) {
                return res.status(404).json({ success: false, message: 'Booking not found' });
            }

            return res.status(200).json({ success: true, data: booking });
        } catch (error) {
            return next(error);
        }
    }

    // GET /bookings/member/:memberId
    async getMemberBookings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const memberId = String(req.params.memberId);
            const { status, page = '1', limit = '20' } = req.query;

            const result = await ClassService.getMemberBookings(
                memberId,
                tenantId,
                status as string | undefined,
                parseInt(page as string, 10),
                parseInt(limit as string, 10)
            );

            return res.status(200).json({
                success: true,
                data: result.bookings,
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

    // GET /:classId/bookings
    async getClassBookings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const classId = String(req.params.classId);
            const { page = '1', limit = '50' } = req.query;
            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);

            const [bookings, total] = await Promise.all([
                Booking.find({ classId, tenantId })
                    .populate('memberId', 'firstName lastName membershipNumber email mobile')
                    .sort({ createdAt: -1 })
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum),
                Booking.countDocuments({ classId, tenantId }),
            ]);

            return res.status(200).json({ success: true, data: { bookings, total } });
        } catch (error) {
            return next(error);
        }
    }

    // GET /:classId/occurrences
    async getClassOccurrences(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const classId = String(req.params.classId);
            const { startDate, endDate } = req.query;

            const classDoc = await ClassService.getClassById(classId, tenantId);
            if (!classDoc) {
                return res.status(404).json({ success: false, message: 'Class not found' });
            }

            // Generate occurrences based on schedule recurrence
            const occurrences: { date: Date; startTime: string; endTime: string }[] = [];
            const from = startDate ? new Date(startDate as string) : new Date();
            const to = endDate
                ? new Date(endDate as string)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // default 30 days ahead

            const schedule = classDoc.schedule;
            const recurrence = schedule.recurrence;
            const startDateObj = new Date(schedule.startDate);
            const endDateObj = schedule.endDate ? new Date(schedule.endDate) : to;

            const effectiveEnd = endDateObj < to ? endDateObj : to;
            const effectiveStart = startDateObj > from ? startDateObj : from;

            if (recurrence === 'once') {
                if (startDateObj >= from && startDateObj <= to) {
                    occurrences.push({
                        date: startDateObj,
                        startTime: schedule.startTime,
                        endTime: schedule.endTime,
                    });
                }
            } else {
                const cursor = new Date(effectiveStart);
                while (cursor <= effectiveEnd) {
                    const dayOfWeek = cursor.getDay();
                    let include = false;

                    if (recurrence === 'daily') {
                        include = true;
                    } else if (recurrence === 'weekly') {
                        include = !schedule.daysOfWeek || schedule.daysOfWeek.length === 0
                            ? dayOfWeek === startDateObj.getDay()
                            : schedule.daysOfWeek.includes(dayOfWeek);
                    } else if (recurrence === 'monthly') {
                        include = cursor.getDate() === startDateObj.getDate();
                    }

                    if (include) {
                        occurrences.push({
                            date: new Date(cursor),
                            startTime: schedule.startTime,
                            endTime: schedule.endTime,
                        });
                    }

                    cursor.setDate(cursor.getDate() + 1);
                }
            }

            return res.status(200).json({
                success: true,
                data: {
                    classId,
                    occurrences,
                    total: occurrences.length,
                },
            });
        } catch (error) {
            return next(error);
        }
    }
}

export default new ClassController();
