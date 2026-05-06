import { Router } from 'express';
import cronController from '../controllers/cron.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// Cron routes secured by super_admin only (or internal CRON_SECRET header)
const cronAuth = (req: any, res: any, next: any) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret && cronSecret === process.env.CRON_SECRET) return next();
    // Fallback: require super_admin JWT
    authenticate(req, res, () => {
        requireAnyRole('super_admin')(req, res, next);
    });
};

router.post('/process-renewals', cronAuth, cronController.processRenewals.bind(cronController));
router.post('/process-trials', cronAuth, cronController.processTrials.bind(cronController));

export default router;
