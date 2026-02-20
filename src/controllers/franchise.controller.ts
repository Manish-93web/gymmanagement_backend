import { Request, Response, NextFunction } from 'express';
import FranchiseService from '../services/franchise.service';

export class FranchiseController {
    async getBranchComparison(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();
            const { period } = req.query;

            const comparison = await FranchiseService.getBranchComparison(
                tenantId,
                period as string
            );

            res.status(200).json({
                success: true,
                data: comparison
            });
        } catch (error) {
            next(error);
        }
    }

    async getPerformanceRanking(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId?.toString();

            const rankings = await FranchiseService.getPerformanceRanking(tenantId);

            res.status(200).json({
                success: true,
                data: rankings
            });
        } catch (error) {
            next(error);
        }
    }

    async getBenchmarkingReports(_req: Request, res: Response, next: NextFunction) {
        try {
            // Mocking benchmarking data for now
            const benchmarks = {
                revenueTarget: 50000,
                retentionBenchmark: 85,
                attendanceTarget: 1200,
                marketAverage: {
                    revenue: 42000,
                    retention: 78
                }
            };

            res.status(200).json({
                success: true,
                data: benchmarks
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new FranchiseController();
