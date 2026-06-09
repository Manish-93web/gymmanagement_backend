import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog.model';
import logger from '../config/logger';

export interface AuditLogData {
    userId?: string;
    tenantId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    changes?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorMessage?: string;
}

class AuditService {
    /**
     * Log an audit event
     */
    async log(data: AuditLogData): Promise<void> {
        try {
            await (AuditLog as any).create({
                ...data,
                timestamp: new Date(),
            });

            logger.info('Audit log created', {
                action: data.action,
                resource: data.resource,
                userId: data.userId,
                status: data.status,
            });
        } catch (error) {
            logger.error('Failed to create audit log', { error, data });
        }
    }

    /**
     * Middleware to automatically log all requests
     */
    auditMiddleware = async (req: Request, res: Response, next: NextFunction) => {
        const originalJson = res.json.bind(res);

        res.json = function (body: any) {
            const user = (req as any).user;

            // Log the request
            AuditService.prototype.log({
                userId: user?._id,
                tenantId: user?.tenantId,
                action: `${req.method} ${req.path}`,
                resource: req.path.split('/')[2] || 'unknown',
                resourceId: req.params.id as string,
                metadata: {
                    method: req.method,
                    path: req.path,
                    query: req.query,
                    params: req.params,
                },
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('user-agent'),
                status: res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure',
                errorMessage: body.message,
            });

            return originalJson(body);
        };

        next();
    };

    /**
     * Get audit logs with filters
     */
    async getLogs(filters: {
        userId?: string;
        tenantId?: string;
        action?: string;
        resource?: string;
        startDate?: Date;
        endDate?: Date;
        status?: 'success' | 'failure';
        page?: number;
        limit?: number;
    }) {
        const {
            userId,
            tenantId,
            action,
            resource,
            startDate,
            endDate,
            status,
            page = 1,
            limit = 50,
        } = filters;

        const query: any = {};

        if (userId) query.userId = userId;
        if (tenantId) query.tenantId = tenantId;
        if (action) query.action = new RegExp(action, 'i');
        if (resource) query.resource = resource;
        if (status) query.status = status;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = startDate;
            if (endDate) query.timestamp.$lte = endDate;
        }

        const total = await AuditLog.countDocuments(query);
        const rawLogs = await AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'firstName lastName email')
            .populate('tenantId', 'name slug')
            .lean();
        // Add `user` alias so frontend can access log.user.email
        const logs = rawLogs.map((log: any) => ({ ...log, user: log.userId }));

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
     * Get audit statistics
     */
    async getStatistics(tenantId?: string, days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const query: any = { timestamp: { $gte: startDate } };
        if (tenantId) query.tenantId = tenantId;

        const [totalLogs, successLogs, failureLogs, actionStats, userStats] = await Promise.all([
            AuditLog.countDocuments(query),
            AuditLog.countDocuments({ ...query, status: 'success' }),
            AuditLog.countDocuments({ ...query, status: 'failure' }),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$userId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
        ]);

        return {
            totalLogs,
            successLogs,
            failureLogs,
            successRate: totalLogs > 0 ? (successLogs / totalLogs) * 100 : 0,
            topActions: actionStats,
            topUsers: userStats,
        };
    }

    /**
     * Export audit logs
     */
    async exportLogs(filters: any, format: 'json' | 'csv' = 'json') {
        const { logs } = await this.getLogs({ ...filters, limit: 10000 });

        if (format === 'csv') {
            const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Status', 'IP Address'];
            const rows = logs.map((log: any) => [
                log.timestamp,
                log.userId?.email || 'N/A',
                log.action,
                log.resource,
                log.status,
                log.ipAddress,
            ]);

            return [headers, ...rows].map((row) => row.join(',')).join('\n');
        }

        return logs;
    }
}

export default new AuditService();

