import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate, tenantContext);

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'unknown'] as const;
type BloodGroup = typeof VALID_BLOOD_GROUPS[number];

// ─── GET /:memberId/emergency-info ────────────────────────────────────────────
// Returns emergency/medical info for a specific member (staff/owner only)
router.get('/:memberId/emergency-info', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { memberId } = req.params;
        const tenantId = (req as any).user?.tenantId || (req as any).tenantId;

        const member = await Member.findOne({ _id: memberId, tenantId })
            .select('firstName lastName bloodGroup emergencyContactName emergencyContactPhone medicalNotes allergies')
            .lean();

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        return res.json({
            success: true,
            data: {
                bloodGroup: member.bloodGroup ?? 'unknown',
                emergencyContactName: member.emergencyContactName ?? '',
                emergencyContactPhone: member.emergencyContactPhone ?? '',
                medicalNotes: member.medicalNotes ?? '',
                allergies: member.allergies ?? '',
            },
        });
    } catch (err) {
        next(err);
    }
});

// ─── PATCH /:memberId/emergency-info ─────────────────────────────────────────
// Update emergency/medical info for a specific member
router.patch('/:memberId/emergency-info', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { memberId } = req.params;
        const tenantId = (req as any).user?.tenantId || (req as any).tenantId;
        const { bloodGroup, emergencyContactName, emergencyContactPhone, medicalNotes, allergies } = req.body;

        // Validate bloodGroup enum if provided
        if (bloodGroup !== undefined && !VALID_BLOOD_GROUPS.includes(bloodGroup as BloodGroup)) {
            return res.status(400).json({
                success: false,
                message: `Invalid blood group. Must be one of: ${VALID_BLOOD_GROUPS.join(', ')}`,
            });
        }

        const updateFields: Record<string, unknown> = {};
        if (bloodGroup !== undefined) updateFields.bloodGroup = bloodGroup;
        if (emergencyContactName !== undefined) updateFields.emergencyContactName = emergencyContactName;
        if (emergencyContactPhone !== undefined) updateFields.emergencyContactPhone = emergencyContactPhone;
        if (medicalNotes !== undefined) updateFields.medicalNotes = medicalNotes;
        if (allergies !== undefined) updateFields.allergies = allergies;

        const member = await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('firstName lastName bloodGroup emergencyContactName emergencyContactPhone medicalNotes allergies');

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        return res.json({
            success: true,
            message: 'Emergency info updated successfully',
            data: {
                bloodGroup: member.bloodGroup ?? 'unknown',
                emergencyContactName: member.emergencyContactName ?? '',
                emergencyContactPhone: member.emergencyContactPhone ?? '',
                medicalNotes: member.medicalNotes ?? '',
                allergies: member.allergies ?? '',
            },
        });
    } catch (err) {
        next(err);
    }
});

// ─── GET /stats/blood-groups ──────────────────────────────────────────────────
// Distribution of blood groups across all members in this tenant
// NOTE: must be defined BEFORE /:memberId routes to avoid param capture
router.get('/stats/blood-groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).user?.tenantId || (req as any).tenantId;

        const distribution = await Member.aggregate([
            { $match: { tenantId } },
            {
                $group: {
                    _id: { $ifNull: ['$bloodGroup', 'unknown'] },
                    count: { $sum: 1 },
                },
            },
            {
                $project: {
                    _id: 0,
                    bloodGroup: '$_id',
                    count: 1,
                },
            },
            { $sort: { count: -1 } },
        ]);

        return res.json({ success: true, data: distribution });
    } catch (err) {
        next(err);
    }
});

export default router;
