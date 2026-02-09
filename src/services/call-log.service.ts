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
    outcome: 'answered' | 'no_answer' | 'busy' | 'voicemail';
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
            ...data,
            callTime: new Date(),
        });

        // Update member's last contact
        await Member.findByIdAndUpdate(data.memberId, {
            lastContactDate: new Date(),
            lastContactType: 'call',
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
        if (staffId) query.staffId = staffId;
        if (callType) query.callType = callType;
        if (outcome) query.outcome = outcome;

        if (startDate || endDate) {
            query.callTime = {};
            if (startDate) query.callTime.$gte = startDate;
            if (endDate) query.callTime.$lte = endDate;
        }

        const total = await CallLog.countDocuments(query);
        const logs = await CallLog.find(query)
            .populate('memberId', 'firstName lastName mobile email')
            .populate('staffId', 'firstName lastName')
            .sort({ callTime: -1 })
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
            callTime: { $gte: startDate, $lte: endDate },
        });

        const stats = {
            totalCalls: logs.length,
            inboundCalls: logs.filter((l) => l.callType === 'inbound').length,
            outboundCalls: logs.filter((l) => l.callType === 'outbound').length,
            answeredCalls: logs.filter((l) => l.outcome === 'answered').length,
            missedCalls: logs.filter((l) => l.outcome === 'no_answer').length,
            averageDuration: logs.reduce((sum, l) => sum + l.duration, 0) / logs.length || 0,
            followUpsRequired: logs.filter((l) => l.followUpRequired).length,
            byPurpose: {} as any,
            byStaff: {} as any,
        };

        // Group by purpose
        logs.forEach((log) => {
            stats.byPurpose[log.purpose] = (stats.byPurpose[log.purpose] || 0) + 1;
        });

        // Group by staff
        logs.forEach((log) => {
            const staffId = log.staffId.toString();
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
            query.staffId = staffId;
        }

        const reminders = await CallLog.find(query)
            .populate('memberId', 'firstName lastName mobile email')
            .populate('staffId', 'firstName lastName')
            .sort({ followUpDate: 1 });

        // Categorize by urgency
        const today = new Date();
        const categorized = {
            overdue: reminders.filter((r) => r.followUpDate && r.followUpDate < today),
            today: reminders.filter(
                (r) =>
                    r.followUpDate &&
                    r.followUpDate.toDateString() === today.toDateString()
            ),
            upcoming: reminders.filter((r) => r.followUpDate && r.followUpDate > today),
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
            .populate('staffId', 'firstName lastName')
            .sort({ callTime: -1 })
            .limit(20);

        const summary = {
            totalCalls: logs.length,
            lastCallDate: logs[0]?.callTime,
            totalDuration: logs.reduce((sum, l) => sum + l.duration, 0),
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
                const staff = log.staffId;
                return [
                    new Date(log.callTime).toLocaleDateString(),
                    new Date(log.callTime).toLocaleTimeString(),
                    `${member.firstName} ${member.lastName}`,
                    `${staff.firstName} ${staff.lastName}`,
                    log.callType,
                    log.purpose,
                    `${Math.floor(log.duration / 60)}m ${log.duration % 60}s`,
                    log.outcome,
                    log.notes || '',
                ].join(',');
            }),
        ].join('\n');

        return csv;
    }
}

export default new CallLogService();
