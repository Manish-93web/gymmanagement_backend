import { Router } from 'express';
import FranchiseController from '../controllers/franchise.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);
router.use(authorize('admin', 'super-admin'));

router.get('/comparison', FranchiseController.getBranchComparison);
router.get('/rankings', FranchiseController.getPerformanceRanking);
router.get('/benchmarks', FranchiseController.getBenchmarkingReports);

export default router;
