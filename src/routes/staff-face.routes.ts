import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { requireAnyRole } from '../middleware/rbac.middleware';
import FaceAttendanceService, { FaceError } from '../services/face-attendance.service';

/**
 * Face check-in for trainers and staff, mounted under /staff/face (authentication is applied by the parent router).
 * The gym's phone stays signed in as the owner; staff pick their name and prove who they are with their face.
 */
const router = Router();
const OWNERS = requireAnyRole('gym_owner', 'branch_manager', 'super_admin');
const isId = (v: any) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

function fail(res: Response, err: any) {
    if (err instanceof FaceError) return res.status(err.status).json({ success: false, message: err.message, code: err.code });
    return res.status(500).json({ success: false, message: err?.message ?? 'Something went wrong' });
}

function announce(req: Request, payload: Record<string, unknown>) {
    try {
        const ws = (global as any).websocketService;
        const tenantId = String((req as any).tenantId);
        if (ws?.broadcastToTenant) ws.broadcastToTenant(tenantId, 'staff:attendance:update', payload);
    } catch { /* live refresh only */ }
}

// Who can check in, who has a face registered, and who is in right now
router.get('/roster', OWNERS, async (req: Request, res: Response) => {
    try {
        return res.json({ success: true, data: await FaceAttendanceService.roster(String((req as any).tenantId)) });
    } catch (err) { return fail(res, err); }
});

// Register (or replace) a person's face from the captures taken in the browser
router.post('/enroll', OWNERS, async (req: Request, res: Response) => {
    try {
        const { staffId, descriptors } = req.body || {};
        if (!isId(staffId)) return res.status(400).json({ success: false, message: 'Choose a staff member' });
        await FaceAttendanceService.enroll(String((req as any).tenantId), staffId, descriptors, (req as any).user?._id?.toString());
        return res.json({ success: true, message: 'Face registered' });
    } catch (err) { return fail(res, err); }
});

// Face check-in / check-out. The time is the server's, never the phone's.
router.post('/punch', OWNERS, async (req: Request, res: Response) => {
    try {
        const { staffId, action, descriptor } = req.body || {};
        if (!isId(staffId)) return res.status(400).json({ success: false, message: 'Choose your name first' });
        const result = await FaceAttendanceService.punch(String((req as any).tenantId), staffId, action, descriptor);
        announce(req, { staffId, action, source: 'face' });
        return res.json({ success: true, data: result });
    } catch (err) { return fail(res, err); }
});

router.post('/:staffId/unlock', OWNERS, async (req: Request, res: Response) => {
    try {
        if (!isId(req.params.staffId)) return res.status(400).json({ success: false, message: 'Invalid staff member' });
        await FaceAttendanceService.unlock(String((req as any).tenantId), String(req.params.staffId));
        return res.json({ success: true });
    } catch (err) { return fail(res, err); }
});

router.delete('/:staffId', OWNERS, async (req: Request, res: Response) => {
    try {
        if (!isId(req.params.staffId)) return res.status(400).json({ success: false, message: 'Invalid staff member' });
        await FaceAttendanceService.remove(String((req as any).tenantId), String(req.params.staffId));
        return res.json({ success: true });
    } catch (err) { return fail(res, err); }
});

export default router;
