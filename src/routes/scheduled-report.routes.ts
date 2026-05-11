import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import ScheduledReportService from '../services/scheduled-report.service';

const router = Router();
router.use(authenticate);

router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const reports = await ScheduledReportService.getAllScheduledReports(tenantId);
        res.json({ success: true, data: { reports } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const report = await ScheduledReportService.createScheduledReport({ ...req.body, tenantId });
        res.status(201).json({ success: true, data: report });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const report = await ScheduledReportService.updateScheduledReport(String(req.params.id), req.body);
        res.json({ success: true, data: report });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/:id/run', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        await ScheduledReportService.executeScheduledReport(String(req.params.id));
        res.json({ success: true, message: 'Report execution started' });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const result = await ScheduledReportService.deleteScheduledReport(String(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(404).json({ success: false, message: err.message });
    }
});

export default router;
