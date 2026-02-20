import Attendance, { IAttendance } from '../models/Attendance.model';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';

export interface CheckInDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    checkInMethod: 'manual' | 'qr_code' | 'rfid' | 'biometric' | 'mobile_app';
    classId?: string;
    trainerId?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
}

export class AttendanceService {
    // Check-in member
    async checkIn(data: CheckInDTO): Promise<IAttendance> {
        // Verify member has active subscription
        const member = await Member.findById(data.memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        if (member.status !== 'active') {
            throw new Error('Member is not active');
        }

        const activeSubscription = await Subscription.findOne({
            memberId: data.memberId,
            status: 'active',
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
        });

        if (!activeSubscription) {
            throw new Error('No active subscription found');
        }

        // Check if already checked in
        const existingCheckIn = await Attendance.findOne({
            memberId: data.memberId,
            checkInTime: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
            checkOutTime: null,
        });

        if (existingCheckIn) {
            throw new Error('Member is already checked in');
        }

        // Create attendance record
        const attendance = await Attendance.create({
            ...data,
            checkInTime: new Date(),
        });

        // Update subscription session count if session-based
        if (activeSubscription.sessions) {
            await Subscription.findByIdAndUpdate(activeSubscription._id, {
                $inc: {
                    'sessions.used': 1,
                    'sessions.remaining': -1,
                },
            });
        }

        return attendance;
    }

    // Check-out member
    async checkOut(attendanceId: string, tenantId: string): Promise<IAttendance | null> {
        const attendance = await Attendance.findOne({ _id: attendanceId, tenantId });

        if (!attendance) {
            throw new Error('Attendance record not found');
        }

        if (attendance.checkOutTime) {
            throw new Error('Member is already checked out');
        }

        const checkOutTime = new Date();
        const duration = Math.floor((checkOutTime.getTime() - attendance.checkInTime.getTime()) / 60000); // minutes

        return await Attendance.findByIdAndUpdate(
            attendanceId,
            {
                $set: {
                    checkOutTime,
                    duration,
                },
            },
            { new: true }
        );
    }

    // Auto check-out (for scheduled jobs)
    async autoCheckOut(tenantId: string, maxDurationMinutes: number = 180): Promise<number> {
        const cutoffTime = new Date(Date.now() - maxDurationMinutes * 60000);

        const result = await Attendance.updateMany(
            {
                tenantId,
                checkOutTime: null,
                checkInTime: { $lte: cutoffTime },
            },
            {
                $set: {
                    checkOutTime: new Date(),
                    autoCheckOut: true,
                },
            }
        );

        return result.modifiedCount;
    }

    // Get attendance by ID
    async getAttendanceById(attendanceId: string, tenantId: string): Promise<IAttendance | null> {
        return await Attendance.findOne({ _id: attendanceId, tenantId });
    }

    // Get member attendance history
    async getMemberAttendance(
        memberId: string,
        tenantId: string,
        startDate?: Date,
        endDate?: Date,
        page: number = 1,
        limit: number = 20
    ): Promise<{ attendance: IAttendance[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { memberId, tenantId };
        if (startDate || endDate) {
            filter.checkInTime = {};
            if (startDate) filter.checkInTime.$gte = startDate;
            if (endDate) filter.checkInTime.$lte = endDate;
        }

        const [attendance, total] = await Promise.all([
            Attendance.find(filter).skip(skip).limit(limit).sort({ checkInTime: -1 }),
            Attendance.countDocuments(filter),
        ]);

        return { attendance, total };
    }

    // Get branch attendance (current)
    async getCurrentBranchAttendance(
        tenantId: string,
        branchId: string
    ): Promise<IAttendance[]> {
        return await Attendance.find({
            tenantId,
            branchId,
            checkOutTime: null,
        }).populate('memberId', 'firstName lastName membershipNumber');
    }

    // Get attendance statistics
    async getAttendanceStats(
        tenantId: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter.checkInTime = {};
            if (startDate) filter.checkInTime.$gte = startDate;
            if (endDate) filter.checkInTime.$lte = endDate;
        }

        const total = await Attendance.countDocuments(filter);
        const uniqueMembers = await Attendance.distinct('memberId', filter);

        // Peak hours analysis
        const peakHours = await Attendance.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { $hour: '$checkInTime' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]);

        // Average duration
        const avgDuration = await Attendance.aggregate([
            { $match: { ...filter, duration: { $exists: true } } },
            {
                $group: {
                    _id: null,
                    avgDuration: { $avg: '$duration' },
                },
            },
        ]);

        return {
            total,
            uniqueMembers: uniqueMembers.length,
            peakHours: peakHours.map(h => ({
                hour: h._id,
                count: h.count,
            })),
            averageDuration: avgDuration[0]?.avgDuration || 0,
        };
    }

    // Bulk sync offline attendance records
    async syncOfflineAttendance(tenantId: string, branchId: string, records: any[]): Promise<any> {
        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        for (const record of records) {
            try {
                // Validate and process each offline check-in
                await this.checkIn({
                    tenantId,
                    branchId,
                    memberId: record.memberId,
                    checkInMethod: record.checkInMethod || 'mobile_app',
                    classId: record.classId,
                    // Note: Use the offline check-in time if provided, or default to now
                });
                results.success++;
            } catch (error: any) {
                results.failed++;
                results.errors.push(`Member ${record.memberId}: ${error.message}`);
            }
        }

        return results;
    }
}

export default new AttendanceService();
