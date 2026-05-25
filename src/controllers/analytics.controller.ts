import { Request, Response, NextFunction } from 'express';
import AnalyticsService from '../services/analytics.service';
import Member from '../models/Member.model';
import User from '../models/User.model';
import Branch from '../models/Branch.model';

const NO_TENANT = (res: Response) =>
    res.status(400).json({ success: false, message: 'Tenant context required' });

export class AnalyticsController {
    async getRevenueAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId, startDate, endDate } = req.query;

            const analytics = await AnalyticsService.getRevenueAnalytics(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getRetentionAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId } = req.query;

            const analytics = await AnalyticsService.getRetentionAnalytics(tenantId, branchId as string);

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getAttendanceAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId, startDate, endDate } = req.query;

            const analytics = await AnalyticsService.getAttendanceAnalytics(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getClassUtilization(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId, startDate, endDate } = req.query;

            const analytics = await AnalyticsService.getClassUtilization(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getTrainerProductivity(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId, startDate, endDate } = req.query;

            const analytics = await AnalyticsService.getTrainerProductivity(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getDashboardOverview(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId } = req.query;

            const overview = await AnalyticsService.getDashboardOverview(tenantId, branchId as string);

            return res.status(200).json({ success: true, data: overview });
        } catch (error) {
            return next(error);
        }
    }

    async getEngagementAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { branchId, startDate, endDate } = req.query;

            const retention = await AnalyticsService.getRetentionAnalytics(tenantId, branchId as string);
            const attendance = await AnalyticsService.getAttendanceAnalytics(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            return res.status(200).json({
                success: true,
                data: {
                    retention,
                    attendance,
                    summary: {
                        activeMembers: retention.activeMembers ?? 0,
                        atRiskMembers: retention.atRiskMembers ?? 0,
                        avgAttendancePerWeek: attendance.averagePerDay ? Number((attendance.averagePerDay * 7).toFixed(1)) : 0,
                    },
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    async getUsageSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const [membersCount, trainersCount, branchesCount] = await Promise.all([
                Member.countDocuments({ tenantId, status: { $ne: 'deleted' } } as any),
                User.countDocuments({ tenantId, role: 'trainer' } as any),
                Branch.countDocuments({ tenantId, isActive: true }),
            ]);
            return res.status(200).json({ success: true, data: { membersCount, trainersCount, branchesCount } });
        } catch (error) {
            return next(error);
        }
    }

    async exportAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return NO_TENANT(res);
            const { name } = req.params;
            const { branchId, startDate, endDate, format = 'json' } = req.query;

            let data: any;
            switch (name) {
                case 'revenue':
                    data = await AnalyticsService.getRevenueAnalytics(
                        tenantId, branchId as string,
                        startDate ? new Date(startDate as string) : undefined,
                        endDate ? new Date(endDate as string) : undefined
                    );
                    break;
                case 'retention':
                    data = await AnalyticsService.getRetentionAnalytics(tenantId, branchId as string);
                    break;
                case 'attendance':
                    data = await AnalyticsService.getAttendanceAnalytics(
                        tenantId, branchId as string,
                        startDate ? new Date(startDate as string) : undefined,
                        endDate ? new Date(endDate as string) : undefined
                    );
                    break;
                case 'class-utilization':
                    data = await AnalyticsService.getClassUtilization(
                        tenantId, branchId as string,
                        startDate ? new Date(startDate as string) : undefined,
                        endDate ? new Date(endDate as string) : undefined
                    );
                    break;
                case 'trainer-productivity':
                    data = await AnalyticsService.getTrainerProductivity(
                        tenantId, branchId as string,
                        startDate ? new Date(startDate as string) : undefined,
                        endDate ? new Date(endDate as string) : undefined
                    );
                    break;
                case 'dashboard':
                    data = await AnalyticsService.getDashboardOverview(tenantId, branchId as string);
                    break;
                default:
                    return res.status(400).json({ success: false, message: `Unknown report: ${name}` });
            }

            if (format === 'csv') {
                const rows = Array.isArray(data) ? data : [data];
                const headers = Object.keys(rows[0] || {});
                const csv = [
                    headers.join(','),
                    ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
                ].join('\n');
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${name}-export.csv"`);
                return res.send(csv);
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return next(error);
        }
    }
}

export default new AnalyticsController();
