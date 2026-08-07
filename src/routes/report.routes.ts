import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import {
    getRecentReports,
    createReportDefinition,
    generateCustomReport,
    getReportById,
    exportReport,
} from '../controllers/report.controller';

const router = Router();
router.use(authenticate);
router.use(requireAnyRole('gym_owner', 'branch_manager', 'super_admin'));

router.get('/recent', getRecentReports);
router.post('/custom', generateCustomReport);
router.post('/export', exportReport);
router.post('/', createReportDefinition);
router.get('/:reportId', getReportById);

export default router;
