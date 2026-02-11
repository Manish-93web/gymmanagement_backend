import { Router } from 'express';
import FranchiseController from '../controllers/franchise.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/comparison', FranchiseController.getBranchComparison);
router.get('/rankings', FranchiseController.getPerformanceRanking);
router.get('/benchmarks', FranchiseController.getBenchmarkingReports);

export default router;
