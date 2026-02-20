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

    async getBenchmarkingReports(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const tenantId = req.user?.role === 'super_admin' ? (req.query.tenantId as string) : req.user?.tenantId?.toString();
            const { branchId } = req.query;

            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant ID is required' });
                return;
            }

            const report = await FranchiseService.getBenchmarkingReports(
                tenantId,
                branchId as string
            );

            res.status(200).json({
                success: true,
                data: report
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new FranchiseController();
