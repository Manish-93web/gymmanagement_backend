import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const STAFF_ROLES = ['owner', 'admin', 'gym_owner', 'branch_manager', 'trainer', 'staff', 'accountant'];

// ─── Blood Group Stats (must be before /:memberId to avoid param capture) ────
// GET /member-health-profile/blood-group-stats — owner/admin only
router.get('/blood-group-stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const tenantId = (req as any).tenantId || user?.tenantId;

        if (!['owner', 'admin', 'gym_owner'].includes(user?.role)) {
            return res.status(403).json({ success: false, message: 'Forbidden — admin only' });
        }

        const stats = await Member.aggregate([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    status: 'active',
                    bloodGroup: { $exists: true, $nin: [null, ''] },
                },
            },
            { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const total = stats.reduce((sum: number, s: any) => sum + s.count, 0);
        const distribution = stats.map((s: any) => ({
            bloodGroup: s._id,
            count: s.count,
            percentage: total > 0 ? Math.round((s.count / total) * 100) : 0,
        }));

        return res.json({ success: true, data: { distribution, total } });
    } catch (err) { next(err); }
});

// ─── Get Member Health Profile ────────────────────────────────────────────────
// GET /member-health-profile/:memberId
// Owner/trainer/staff: any member. Member: own record only.
router.get('/:memberId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const tenantId = (req as any).tenantId || user?.tenantId;
        const { memberId } = req.params;

        const member = await Member.findOne({ _id: memberId, tenantId })
            .select('firstName lastName bloodGroup emergencyContact medicalNotes userId')
            .lean();

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const isStaff = STAFF_ROLES.includes(user?.role);
        const isOwnRecord = member.userId?.toString() === user?._id?.toString();

        if (!isStaff && !isOwnRecord) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // Members cannot see medicalNotes — staff-only field
        const responseData: Record<string, any> = { ...member };
        if (!isStaff) {
            delete responseData.medicalNotes;
        }

        return res.json({ success: true, data: responseData });
    } catch (err) { next(err); }
});

// ─── Update Member Health Profile ────────────────────────────────────────────
// PATCH /member-health-profile/:memberId
// Owner/trainer/staff: all fields. Member: bloodGroup + emergencyContact only.
router.patch('/:memberId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const tenantId = (req as any).tenantId || user?.tenantId;
        const { memberId } = req.params;
        const { bloodGroup, emergencyContact, medicalNotes } = req.body;

        const member = await Member.findOne({ _id: memberId, tenantId }).lean();
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const isStaff = STAFF_ROLES.includes(user?.role);
        const isOwnRecord = member.userId?.toString() === user?._id?.toString();

        if (!isStaff && !isOwnRecord) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // medicalNotes is staff-only
        if (medicalNotes !== undefined && !isStaff) {
            return res.status(403).json({
                success: false,
                message: 'Medical notes can only be updated by staff',
            });
        }

        const updates: Record<string, any> = {};
        if (bloodGroup !== undefined) updates.bloodGroup = bloodGroup;
        if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
        if (medicalNotes !== undefined) updates.medicalNotes = medicalNotes;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        const updated = await Member.findByIdAndUpdate(
            memberId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('firstName lastName bloodGroup emergencyContact medicalNotes');

        return res.json({ success: true, data: updated });
    } catch (err) { next(err); }
});

export default router;
