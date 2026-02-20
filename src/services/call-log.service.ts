import CallLog from '../models/CallLog.model';
import Member from '../models/Member.model';
import User from '../models/User.model';
import logger from '../config/logger';

interface CallLogData {
    memberId: string;
    staffId: string;
    callType: 'inbound' | 'outbound';
    purpose: string;
    duration: number; // in seconds
    outcome: 'completed' | 'missed' | 'busy' | 'no-answer' | 'failed';
    notes?: string;
    followUpRequired?: boolean;
    followUpDate?: Date;
    tenantId: string;
}

class CallLogService {
    /**
     * Create call log
     */
    async createCallLog(data: CallLogData) {
        const callLog = await CallLog.create({
            tenantId: data.tenantId,
            memberId: data.memberId,
            userId: data.staffId,
            direction: data.callType,
            status: data.outcome,
            startTime: new Date(),
            duration: data.duration,
            notes: data.notes,
            purpose: data.purpose,
            followUpRequired: data.followUpRequired,
            nextFollowUp: data.followUpDate,
            followUpCompleted: false,
        });

        // Update member's last contact
        await Member.findByIdAndUpdate(data.memberId, {
            lastCheckIn: new Date(), // Using lastCheckIn as proxy or simply logging interaction
        });

        logger.info('Call log created', { callLogId: callLog._id, memberId: data.memberId });

        return callLog;
    }

    /**
     * Get call logs with filters
     */
    async getCallLogs(filters: {
        tenantId: string;
        memberId?: string;
        staffId?: string;
        startDate?: Date;
        endDate?: Date;
        callType?: string;
        outcome?: string;
        page?: number;
        limit?: number;
    }) {
        const {
            tenantId,
            memberId,
            staffId,
            startDate,
            endDate,
            callType,
            outcome,
            page = 1,
            limit = 50,
        } = filters;

        const query: any = { tenantId };

        if (memberId) query.memberId = memberId;
        if (staffId) query.userId = staffId;
        if (callType) query.direction = callType;
        if (outcome) query.status = outcome;

        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = startDate;
            if (endDate) query.startTime.$lte = endDate;
        }

        const total = await CallLog.countDocuments(query);
        const logs = await CallLog.find(query)
            .populate('memberId', 'firstName lastName mobile email')
            .populate('userId', 'firstName lastName')
            .sort({ startTime: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            logs,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get call statistics
     */
    async getCallStatistics(tenantId: string, startDate: Date, endDate: Date) {
        const logs = await CallLog.find({
            tenantId,
            startTime: { $gte: startDate, $lte: endDate },
        });

        const stats = {
            totalCalls: logs.length,
            inboundCalls: logs.filter((l) => l.direction === 'inbound').length,
            outboundCalls: logs.filter((l) => l.direction === 'outbound').length,
            answeredCalls: logs.filter((l) => l.status === 'completed').length,
            missedCalls: logs.filter((l) => l.status === 'no-answer' || l.status === 'missed').length,
            averageDuration: logs.length > 0 ? logs.reduce((sum, l) => sum + (l.duration || 0), 0) / logs.length : 0,
            followUpsRequired: logs.filter((l) => l.followUpRequired).length,
            byPurpose: {} as any,
            byStaff: {} as any,
        };

        // Group by purpose
        logs.forEach((log) => {
            if (log.purpose) {
                stats.byPurpose[log.purpose] = (stats.byPurpose[log.purpose] || 0) + 1;
            }
        });

        // Group by staff
        logs.forEach((log) => {
            const staffId = log.userId.toString();
            stats.byStaff[staffId] = (stats.byStaff[staffId] || 0) + 1;
        });

        return stats;
    }

    /**
     * Get follow-up reminders
     */
    async getFollowUpReminders(tenantId: string, staffId?: string) {
        const query: any = {
            tenantId,
            followUpRequired: true,
            followUpCompleted: { $ne: true },
        };

        if (staffId) {
            query.userId = staffId;
        }

        const reminders = await CallLog.find(query)
            .populate('memberId', 'firstName lastName mobile email')
            .populate('userId', 'firstName lastName')
            .sort({ nextFollowUp: 1 });

        // Categorize by urgency
        const today = new Date();
        const categorized = {
            overdue: reminders.filter((r) => r.nextFollowUp && r.nextFollowUp < today),
            today: reminders.filter(
                (r) =>
                    r.nextFollowUp &&
                    r.nextFollowUp.toDateString() === today.toDateString()
            ),
            upcoming: reminders.filter((r) => r.nextFollowUp && r.nextFollowUp > today),
        };

        return categorized;
    }

    /**
     * Mark follow-up as completed
     */
    async completeFollowUp(callLogId: string, notes?: string) {
        const callLog = await CallLog.findByIdAndUpdate(
            callLogId,
            {
                followUpCompleted: true,
                followUpCompletedAt: new Date(),
                followUpNotes: notes,
            },
            { new: true }
        );

        if (!callLog) {
            throw new Error('Call log not found');
        }

        logger.info('Follow-up completed', { callLogId });

        return {
            success: true,
            message: 'Follow-up marked as completed',
        };
    }

    /**
     * Get member call history
     */
    async getMemberCallHistory(memberId: string) {
        const logs = await CallLog.find({ memberId })
            .populate('userId', 'firstName lastName')
            .sort({ startTime: -1 })
            .limit(20);

        const summary = {
            totalCalls: logs.length,
            lastCallDate: logs[0]?.startTime,
            totalDuration: logs.reduce((sum, l) => sum + (l.duration || 0), 0),
            pendingFollowUps: logs.filter((l) => l.followUpRequired && !l.followUpCompleted).length,
        };

        return {
            summary,
            logs,
        };
    }

    /**
     * Export call logs to CSV
     */
    async exportCallLogs(filters: any) {
        const { logs } = await this.getCallLogs({ ...filters, limit: 10000 });

        const csv = [
            'Date,Time,Member,Staff,Type,Purpose,Duration,Outcome,Notes',
            ...logs.map((log: any) => {
                const member = log.memberId;
                const staff = log.userId;
                return [
                    new Date(log.startTime).toLocaleDateString(),
                    new Date(log.startTime).toLocaleTimeString(),
                    member ? `${member.firstName} ${member.lastName}` : 'Unknown',
                    staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown',
                    log.direction,
                    log.purpose,
                    `${Math.floor((log.duration || 0) / 60)}m ${(log.duration || 0) % 60}s`,
                    log.status,
                    log.notes || '',
                ].join(',');
            }),
        ].join('\n');

        return csv;
    }
}

export default new CallLogService();
