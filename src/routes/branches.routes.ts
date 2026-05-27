import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Branch from '../models/Branch.model';
import Tenant from '../models/Tenant.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate, tenantContext);

// POST /api/branches/current/hardware-key — generate or regenerate hardware pairing key
router.post('/current/hardware-key',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const user     = (req as any).user;
            const tenantId = (req as any).tenantId;

            // Use explicit branchId from JWT, or fall back to first branch for gym_owners
            let branchId = user.branchId;
            if (!branchId) {
                const first = await Branch.findOne({ tenantId, isActive: true }).select('_id').lean();
                branchId = (first as any)?._id?.toString();
            }
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'No branch found — add a branch first' });
            }

            const newKey = `hw_${crypto.randomBytes(16).toString('hex')}`;
            await Branch.findOneAndUpdate({ _id: branchId, tenantId }, { $set: { hardwareKey: newKey } });

            return res.json({ success: true, data: { hardwareKey: newKey } });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// GET /api/branches/current — returns the branch of the authenticated user
router.get('/current', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const tenantId = (req as any).tenantId;

        if (user.branchId) {
            const branch = await Branch.findOne({ _id: user.branchId, tenantId }).lean();
            if (!branch) {
                return res.status(404).json({ success: false, message: 'Branch not found' });
            }
            return res.json({ success: true, data: branch });
        }

        // Gym owner / super_admin: return first active branch or tenant-level info
        const branch = await Branch.findOne({ tenantId, isActive: true }).lean();
        if (branch) {
            return res.json({ success: true, data: branch });
        }

        // Fallback: return basic tenant info shaped as branch
        const tenant = await Tenant.findById(tenantId).lean();
        return res.json({
            success: true,
            data: {
                _id: tenant?._id,
                name: (tenant as any)?.gymName || 'Main Branch',
                tenantId,
                isActive: true,
                contactInfo: {
                    phone: (tenant as any)?.phone || '',
                    email: (tenant as any)?.email || '',
                    address: (tenant as any)?.address || '',
                },
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/branches — list all branches for tenant (with computed memberCount, todayAttendance, utilization)
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const branches = await Branch.find({ tenantId }).lean();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const enriched = await Promise.all(branches.map(async (b: any) => {
            const branchId = b._id.toString();
            const [memberCount, todayAttendance] = await Promise.all([
                Member.countDocuments({ tenantId, branchId, status: { $in: ['active', 'trial'] } }),
                Attendance.countDocuments({ tenantId, branchId, checkInTime: { $gte: todayStart } }),
            ]);
            const capacity: number = b.capacity?.total ?? 0;
            const utilization = capacity > 0 ? Math.min(100, Math.round((memberCount / capacity) * 100)) : 0;
            return { ...b, memberCount, todayAttendance, utilization };
        }));

        res.json({ success: true, data: enriched });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/branches/:id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const branch = await Branch.findOne({ _id: req.params.id, tenantId }).lean();
        if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
        res.json({ success: true, data: branch });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/branches — create branch
router.post('/', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const branch = await Branch.create({ ...req.body, tenantId });
        res.status(201).json({ success: true, data: branch });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/branches/:id — update branch
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const branch = await Branch.findOneAndUpdate(
            { _id: req.params.id, tenantId },
            req.body,
            { new: true, runValidators: true }
        ).lean();
        if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
        res.json({ success: true, data: branch });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/branches/:id — soft-delete (set isActive = false)
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const branch = await Branch.findOneAndUpdate(
            { _id: req.params.id, tenantId },
            { isActive: false },
            { new: true }
        ).lean();
        if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
        res.json({ success: true, message: 'Branch deactivated' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
