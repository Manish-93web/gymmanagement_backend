import { Router, Request, Response } from 'express';
import SaaSAlert from '../models/SaaSAlert.model';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

const isPlatformRole = (role: string) => role === 'super_admin' || role === 'platform_admin';

// GET /api/saas-alerts — get alerts for current user's audience
router.get('/', async (req: Request, res: Response, next) => {
    if (isPlatformRole((req as any).user?.role)) return next();
    tenantContext(req, res, next);
}, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { unread, limit = '20', page = '1' } = req.query;

        const isPlatform = isPlatformRole(user.role);
        const audience = isPlatform ? 'super_admin' : 'gym_owner';
        const filter: any = { audience };
        if (!isPlatform) filter.tenantId = (req as any).tenantId;
        if (unread === 'true') filter.isRead = false;

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const alerts = await SaaSAlert.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit as string))
            .lean();

        const total = await SaaSAlert.countDocuments(filter);
        const unreadCount = await SaaSAlert.countDocuments({ ...filter, isRead: false });

        res.json({ success: true, data: { alerts, total, unreadCount } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/saas-alerts/:id/read — mark alert as read
router.patch('/:id/read', async (req: Request, res: Response, next) => {
    if (isPlatformRole((req as any).user?.role)) return next();
    tenantContext(req, res, next);
}, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const matchFilter: any = { _id: req.params.id };
        if (!isPlatformRole(user.role)) matchFilter.tenantId = (req as any).tenantId;

        const alert = await SaaSAlert.findOneAndUpdate(
            matchFilter,
            { isRead: true, readAt: new Date() },
            { new: true }
        );
        if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
        res.json({ success: true, data: alert });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/saas-alerts/read-all — mark all alerts as read
router.patch('/read-all', async (req: Request, res: Response, next) => {
    if (isPlatformRole((req as any).user?.role)) return next();
    tenantContext(req, res, next);
}, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const isPlatform = isPlatformRole(user.role);
        const audience = isPlatform ? 'super_admin' : 'gym_owner';
        const matchFilter: any = { audience, isRead: false };
        if (!isPlatform) matchFilter.tenantId = (req as any).tenantId;

        await SaaSAlert.updateMany(matchFilter, { isRead: true, readAt: new Date() });
        res.json({ success: true, message: 'All alerts marked as read' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/saas-alerts — create alert (super_admin only)
router.post('/', requireAnyRole('super_admin', 'platform_admin'), async (req: Request, res: Response) => {
    try {
        const alert = await SaaSAlert.create(req.body);
        res.status(201).json({ success: true, data: alert });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
