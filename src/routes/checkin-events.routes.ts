import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication + tenant context
router.use(authenticate, tenantContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapMethod(method: string): 'biometric' | 'qr' | 'manual' {
    if (method === 'biometric' || method === 'rfid') return 'biometric';
    if (method === 'qr' || method === 'qr_code') return 'qr';
    return 'manual';
}

function calcDaysRemaining(expiry: Date | undefined | null): number {
    if (!expiry) return -999;
    const now = new Date();
    const exp = new Date(expiry);
    return Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(days: number): 'good' | 'warning' | 'critical' | 'expired' {
    if (days > 30) return 'good';
    if (days > 7) return 'warning';
    if (days >= 1) return 'critical';
    return 'expired';
}

async function enrichAttendanceRecord(record: any, tenantId: string) {
    // Defensive require — models guaranteed to exist
    const Member = require('../models/Member.model').default;
    const MembershipPlan = require('../models/MembershipPlan.model').default;
    const User = require('../models/User.model').default;

    const member = await Member.findOne({ _id: record.memberId, tenantId }).lean();
    if (!member) return null;

    const m = member as any;

    // Plan name
    let planName = 'N/A';
    const planId = m.planId;
    if (planId) {
        try {
            const plan = await MembershipPlan.findById(planId).select('name').lean();
            if (plan) planName = (plan as any).name;
        } catch { /* ignore */ }
    }

    // Trainer name
    let trainerName = '';
    const trainerId = m.personalInfo?.preferredTrainer;
    if (trainerId) {
        try {
            const trainer = await User.findById(trainerId).select('firstName lastName').lean();
            if (trainer) {
                trainerName = `${(trainer as any).firstName} ${(trainer as any).lastName}`.trim();
            }
        } catch { /* ignore */ }
    }

    const days = calcDaysRemaining(m.membershipExpiry);

    return {
        memberId: String(record.memberId),
        memberName: `${m.firstName} ${m.lastName}`.trim(),
        memberPhoto: m.personalInfo?.profilePicture ?? null,
        phone: m.mobile ?? '',
        planName,
        expiryDate: m.membershipExpiry ? new Date(m.membershipExpiry).toISOString().split('T')[0] : null,
        daysRemaining: days,
        expiryStatus: expiryStatus(days),
        outstandingDues: m.dueAmount ?? 0,
        trainerName: trainerName || null,
        checkInTime: record.checkInTime,
        checkInType: mapMethod(record.method ?? 'manual'),
    };
}

// ─── GET /latest ─────────────────────────────────────────────────────────────
// Returns the single most recent check-in for polling fallback
router.get(
    '/latest',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId ?? (req as any).user?.tenantId?.toString();
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context missing' });
                return;
            }

            const Attendance = require('../models/Attendance.model').default;

            const latest = await Attendance.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
                .sort({ checkInTime: -1 })
                .lean();

            if (!latest) {
                res.json({ success: true, data: null });
                return;
            }

            const enriched = await enrichAttendanceRecord(latest, tenantId);
            res.json({ success: true, data: enriched });
        } catch (err: any) {
            console.error('[checkin-events] GET /latest error:', err?.message);
            res.status(500).json({ success: false, message: 'Failed to fetch latest check-in' });
        }
    },
);

// ─── GET /stream ─────────────────────────────────────────────────────────────
// Returns check-ins from the last 30 seconds (polling-based, SSE-style response)
router.get(
    '/stream',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId ?? (req as any).user?.tenantId?.toString();
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context missing' });
                return;
            }

            const Attendance = require('../models/Attendance.model').default;
            const since = new Date(Date.now() - 30000); // last 30 seconds

            const recentCheckins = await Attendance.find({
                tenantId: new mongoose.Types.ObjectId(tenantId),
                checkInTime: { $gte: since },
            })
                .sort({ checkInTime: -1 })
                .limit(10)
                .lean();

            const enriched = await Promise.all(
                recentCheckins.map((r: any) => enrichAttendanceRecord(r, tenantId)),
            );

            res.json({
                success: true,
                data: enriched.filter(Boolean),
                since: since.toISOString(),
            });
        } catch (err: any) {
            console.error('[checkin-events] GET /stream error:', err?.message);
            res.status(500).json({ success: false, message: 'Failed to fetch recent check-ins' });
        }
    },
);

// ─── GET /member/:memberId/quick-card ─────────────────────────────────────────
// Returns quick card data for a specific member
router.get(
    '/member/:memberId/quick-card',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId ?? (req as any).user?.tenantId?.toString();
            const { memberId } = req.params;

            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context missing' });
                return;
            }

            if (!mongoose.Types.ObjectId.isValid(memberId)) {
                res.status(400).json({ success: false, message: 'Invalid memberId' });
                return;
            }

            const Member = require('../models/Member.model').default;
            const MembershipPlan = require('../models/MembershipPlan.model').default;
            const User = require('../models/User.model').default;

            const member = await Member.findOne({
                _id: new mongoose.Types.ObjectId(memberId),
                tenantId: new mongoose.Types.ObjectId(tenantId),
            }).lean();

            if (!member) {
                res.status(404).json({ success: false, message: 'Member not found' });
                return;
            }

            const m = member as any;

            let planName = 'N/A';
            if (m.planId) {
                try {
                    const plan = await MembershipPlan.findById(m.planId).select('name').lean();
                    if (plan) planName = (plan as any).name;
                } catch { /* ignore */ }
            }

            let trainerName = '';
            if (m.personalInfo?.preferredTrainer) {
                try {
                    const trainer = await User.findById(m.personalInfo.preferredTrainer)
                        .select('firstName lastName')
                        .lean();
                    if (trainer) {
                        trainerName = `${(trainer as any).firstName} ${(trainer as any).lastName}`.trim();
                    }
                } catch { /* ignore */ }
            }

            const days = calcDaysRemaining(m.membershipExpiry);

            res.json({
                success: true,
                data: {
                    memberId: String(m._id),
                    memberName: `${m.firstName} ${m.lastName}`.trim(),
                    memberPhoto: m.personalInfo?.profilePicture ?? null,
                    phone: m.mobile ?? '',
                    planName,
                    expiryDate: m.membershipExpiry ? new Date(m.membershipExpiry).toISOString().split('T')[0] : null,
                    daysRemaining: days,
                    expiryStatus: expiryStatus(days),
                    outstandingDues: m.dueAmount ?? 0,
                    trainerName: trainerName || null,
                },
            });
        } catch (err: any) {
            console.error('[checkin-events] GET /member/:memberId/quick-card error:', err?.message);
            res.status(500).json({ success: false, message: 'Failed to fetch member card data' });
        }
    },
);

export default router;
