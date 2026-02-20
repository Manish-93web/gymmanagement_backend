import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import AnalyticsService from '../services/analytics.service';

export class AnalyticsController {
    async getRevenueAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
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
            const tenantId = req.user!.tenantId!.toString();
            const { branchId } = req.query;

            const analytics = await AnalyticsService.getRetentionAnalytics(tenantId, branchId as string);

            return res.status(200).json({ success: true, data: analytics });
        } catch (error) {
            return next(error);
        }
    }

    async getAttendanceAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId!.toString();
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
            const tenantId = req.user!.tenantId!.toString();
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
            const tenantId = req.user!.tenantId!.toString();
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
            const tenantId = req.user!.tenantId!.toString();
            const { branchId } = req.query;

            const overview = await AnalyticsService.getDashboardOverview(tenantId, branchId as string);

            return res.status(200).json({ success: true, data: overview });
        } catch (error) {
            return next(error);
        }
    }
}

export default new AnalyticsController();
