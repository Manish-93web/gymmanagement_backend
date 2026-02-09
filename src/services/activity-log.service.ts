import ActivityLog from '../models/ActivityLog.model';
import logger from '../config/logger';

interface LogEntry {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    tenantId: string;
}

class ActivityLogService {
    /**
     * Create activity log
     */
    async log(entry: LogEntry) {
        const log = await ActivityLog.create({
            ...entry,
            timestamp: new Date(),
        });

        return log;
    }

    /**
     * Get activity logs with filters
     */
    async getLogs(filters: {
        tenantId: string;
        userId?: string;
        action?: string;
        resource?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }) {
        const {
            tenantId,
            userId,
            action,
            resource,
            startDate,
            endDate,
            page = 1,
            limit = 50,
        } = filters;

        const query: any = { tenantId };

        if (userId) query.userId = userId;
        if (action) query.action = action;
        if (resource) query.resource = resource;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = startDate;
            if (endDate) query.timestamp.$lte = endDate;
        }

        const total = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .populate('userId', 'firstName lastName email role')
            .sort({ timestamp: -1 })
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
     * Get user activity summary
     */
    async getUserActivitySummary(userId: string, days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await ActivityLog.find({
            userId,
            timestamp: { $gte: startDate },
        });

        const summary = {
            totalActions: logs.length,
            byAction: {} as any,
            byResource: {} as any,
            recentActivity: logs.slice(0, 10),
        };

        logs.forEach((log) => {
            summary.byAction[log.action] = (summary.byAction[log.action] || 0) + 1;
            summary.byResource[log.resource] = (summary.byResource[log.resource] || 0) + 1;
        });

        return summary;
    }

    /**
     * Export logs to CSV
     */
    async exportLogs(filters: any): Promise<string> {
        const { logs } = await this.getLogs({ ...filters, limit: 10000 });

        const csv = [
            'Timestamp,User,Action,Resource,IP Address,Details',
            ...logs.map((log: any) => {
                const user = log.userId;
                return [
                    new Date(log.timestamp).toLocaleString(),
                    user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                    log.action,
                    log.resource,
                    log.ipAddress || '',
                    JSON.stringify(log.details || {}),
                ].join(',');
            }),
        ].join('\n');

        return csv;
    }

    /**
     * Clean old logs
     */
    async cleanOldLogs(daysToKeep: number = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await ActivityLog.deleteMany({
            timestamp: { $lt: cutoffDate },
        });

        logger.info('Old activity logs cleaned', { deletedCount: result.deletedCount });

        return {
            success: true,
            deletedCount: result.deletedCount,
        };
    }
}

export default new ActivityLogService();
