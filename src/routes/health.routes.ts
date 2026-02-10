import express from 'express';
import { syncHealthData, getHealthSummary } from '../controllers/health.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/sync', syncHealthData);
router.get('/summary', getHealthSummary);

export default router;
