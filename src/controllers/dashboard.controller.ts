import { Request, Response, NextFunction } from 'express';
import dashboardService from '../services/dashboard.service';

export class DashboardController {
    // Main entry point for all role-based dashboards
    async getDashboardData(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?._id.toString() || '';
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString();
            const role = req.user?.role;

            if (!role) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const data = await dashboardService.getDataForRole(role, userId, tenantId, branchId);

            return res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            return next(error);
        }
    }

    // Legacy support for specific routes if needed
    async getOverview(req: Request, res: Response, next: NextFunction) {
        return this.getDashboardData(req, res, next);
    }

    async getMemberDashboard(req: Request, res: Response, next: NextFunction) {
        return this.getDashboardData(req, res, next);
    }

    async getTrainerDashboard(req: Request, res: Response, next: NextFunction) {
        return this.getDashboardData(req, res, next);
    }

    async getBranchStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';

            if (!branchId) {
                return res.status(400).json({ success: false, message: 'Branch ID required' });
            }

            const data = await dashboardService.getBranchStats(tenantId, branchId);
            return res.status(200).json({ success: true, data });
        } catch (error) {
            return next(error);
        }
    }
}

export default new DashboardController();
