import Attendance, { IAttendance } from '../models/Attendance.model';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';

export interface CheckInDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    checkInMethod: 'manual' | 'qr_code' | 'rfid' | 'biometric' | 'mobile_app';
    checkInTime?: Date;
    checkOutTime?: Date;
    classId?: string;
    trainerId?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
}

export class AttendanceService {
    private emitAttendanceUpdate(tenantId: string, branchId: string, payload: any) {
        try {
            const ws = (global as any).websocketService;
            if (ws?.broadcastToTenant) ws.broadcastToTenant(tenantId, 'attendance:update', payload);
            if (branchId && ws?.broadcastToBranch) ws.broadcastToBranch(branchId, 'attendance:update', payload);
        } catch { /* non-critical */ }
    }

    // Check-in member
    async checkIn(data: CheckInDTO): Promise<IAttendance> {
        const member = await Member.findOne({ _id: data.memberId, tenantId: data.tenantId });
        if (!member) {
            throw new Error('Member not found');
        }

        // Allow active and trial members; manual check-in bypasses status check
        if (data.checkInMethod !== 'manual' && !['active', 'trial'].includes(member.status)) {
            throw new Error('Member is not active');
        }

        const resolvedCheckInTime = data.checkInTime ? new Date(data.checkInTime) : new Date();
        const dayStart = new Date(resolvedCheckInTime);
        dayStart.setHours(0, 0, 0, 0);

        // Check if already checked in on the same calendar day
        const existingCheckIn = await Attendance.findOne({
            memberId: data.memberId,
            tenantId: data.tenantId,
            checkInTime: { $gte: dayStart },
            checkOutTime: null,
        });

        if (existingCheckIn && data.checkInMethod !== 'manual') {
            throw new Error('Member is already checked in');
        }

        // Map checkInMethod → method (Attendance schema field is 'method')
        const methodMap: Record<string, string> = { qr_code: 'qr' };
        const method = (methodMap[data.checkInMethod] ?? data.checkInMethod) as any;

        const createData: any = {
            tenantId: data.tenantId,
            branchId: data.branchId,
            memberId: data.memberId,
            classId: data.classId,
            trainerId: data.trainerId,
            location: data.location,
            method,
            checkInTime: resolvedCheckInTime,
        };
        if (data.checkOutTime) {
            const resolvedCheckOut = new Date(data.checkOutTime);
            createData.checkOutTime = resolvedCheckOut;
            const diffMs = resolvedCheckOut.getTime() - resolvedCheckInTime.getTime();
            createData.duration = Math.max(0, Math.floor(diffMs / 60000));
        }

        const attendance = await Attendance.create(createData);

        // Update session count for session-based subscriptions
        const activeSub = await Subscription.findOne({
            memberId: data.memberId,
            tenantId: data.tenantId,
            status: 'active',
        });
        if (activeSub?.sessions) {
            await Subscription.findByIdAndUpdate(activeSub._id, {
                $inc: { 'sessions.used': 1, 'sessions.remaining': -1 },
            });
        }

        this.emitAttendanceUpdate(data.tenantId, data.branchId, {
            type: 'checkin',
            memberId: data.memberId,
            attendanceId: attendance._id.toString(),
        });

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
        const duration = Math.floor((checkOutTime.getTime() - attendance.checkInTime.getTime()) / 60000);

        const updated = await Attendance.findByIdAndUpdate(
            attendanceId,
            { $set: { checkOutTime, duration } },
            { new: true }
        );

        this.emitAttendanceUpdate(tenantId, attendance.branchId?.toString() ?? '', {
            type: 'checkout',
            memberId: attendance.memberId?.toString(),
            attendanceId,
        });

        return updated;
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
