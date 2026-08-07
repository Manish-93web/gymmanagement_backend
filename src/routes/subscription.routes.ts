import { Router, Request, Response } from 'express';
import subscriptionController from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import SubscriptionModel from '../models/Subscription.model';

const router = Router();

router.use(authenticate);

router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), subscriptionController.getSubscriptions.bind(subscriptionController));
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), subscriptionController.createSubscription.bind(subscriptionController));
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), subscriptionController.getSubscriptionStats.bind(subscriptionController));
router.get('/member/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'member', 'super_admin'), subscriptionController.getMemberSubscriptions.bind(subscriptionController));
router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), subscriptionController.getSubscription.bind(subscriptionController));
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), subscriptionController.updateSubscription.bind(subscriptionController));
router.get('/:id/history', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.getSubscriptionHistory.bind(subscriptionController));
router.post('/:id/cancel', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.cancelSubscription.bind(subscriptionController));
router.post('/:id/freeze', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.freezeSubscription.bind(subscriptionController));
router.post('/:id/unfreeze', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), subscriptionController.unfreezeSubscription.bind(subscriptionController));
router.post('/:id/renew', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), subscriptionController.renewSubscription.bind(subscriptionController));

// ─── Session-based subscription: record session usage ────────────────────────
router.post('/:id/use-session', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const sub = await SubscriptionModel.findById(req.params.id)
            .populate('planId', 'type name sessions');
        if (!sub) { res.status(404).json({ success: false, message: 'Subscription not found' }); return; }
        if ((sub as any).status !== 'active') {
            res.status(400).json({ success: false, message: `Subscription is ${(sub as any).status}, not active` });
            return;
        }
        const planType: string = (sub as any).planId?.type ?? '';
        if (planType !== 'session_based' && planType !== 'hybrid') {
            res.status(400).json({ success: false, message: 'This subscription is not session-based' });
            return;
        }
        const sessions = (sub as any).sessions ?? {};
        const remaining = sessions.remainingSessions ?? 0;
        if (remaining <= 0) {
            res.status(400).json({ success: false, message: 'No sessions remaining' });
            return;
        }
        const { notes, trainerId } = req.body;
        const usedBy = (req as any).user?._id ?? (req as any).user?.id;

        (sub as any).sessions.usedSessions  = (sessions.usedSessions  ?? 0) + 1;
        (sub as any).sessions.remainingSessions = remaining - 1;

        // Auto-expire when last session is consumed
        if ((sub as any).sessions.remainingSessions === 0) {
            (sub as any).status = 'expired';
        }

        await (sub as any).save();

        res.json({
            success: true,
            data: {
                subscriptionId: sub._id,
                sessionsUsed:      (sub as any).sessions.usedSessions,
                sessionsRemaining: (sub as any).sessions.remainingSessions,
                status: (sub as any).status,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Session balance for a subscription ──────────────────────────────────────
router.get('/:id/sessions', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const sub = await SubscriptionModel.findById(req.params.id)
            .select('sessions status planId memberId')
            .populate('planId', 'type name sessions')
            .lean();
        if (!sub) { res.status(404).json({ success: false, message: 'Subscription not found' }); return; }
        res.json({ success: true, data: { sessions: (sub as any).sessions, planType: (sub as any).planId?.type, status: (sub as any).status } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
